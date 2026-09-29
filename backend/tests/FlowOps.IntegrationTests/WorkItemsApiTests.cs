using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FlowOps.Application.DTOs;
using FlowOps.Application.Exceptions;
using FlowOps.Application.Interfaces;
using FlowOps.Domain.Enums;
using FlowOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace FlowOps.IntegrationTests;

public class WorkItemsApiTests : IClassFixture<FlowOpsApiFactory>
{
    private static readonly Guid OperationsId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly Guid SupportId = Guid.Parse("10000000-0000-0000-0000-000000000002");
    private readonly FlowOpsApiFactory _factory;

    public WorkItemsApiTests(FlowOpsApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Categories_Create_Read_AndCreatedActivity_Persist()
    {
        await _factory.ResetDatabaseAsync();

        var categories = await _factory.Client.GetFromJsonAsync<CategoryResponse[]>("/api/v1/categories");
        Assert.NotNull(categories);
        Assert.Equal(new[] { "Billing", "Engineering", "Operations", "Support" }, categories.Select(x => x.Name));

        var created = await CreateAsync("Investigate login", "Intermittent failure", "High", OperationsId, "Ahmad");
        Assert.Equal(OperationsId, created.CategoryId);
        Assert.Equal("Operations", created.CategoryName);

        var detail = await _factory.Client.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{created.Id}");
        Assert.NotNull(detail);
        Assert.Equal("Investigate login", detail.Title);
        Assert.Equal("Todo", detail.Status);
        Assert.Equal("Ahmad", detail.AssigneeName);

        var activity = await _factory.Client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{created.Id}/activity");
        Assert.NotNull(activity);
        var initialEvent = Assert.Single(activity);
        Assert.Equal("Created", initialEvent.EventType);
        Assert.Equal(created.Id, initialEvent.WorkItemId);
        Assert.Null(initialEvent.ActorUserId);
    }

    [Fact]
    public async Task Patch_Assignment_Status_AndActivity_Persist()
    {
        await _factory.ResetDatabaseAsync();
        var item = await CreateAsync("Initial", "Original description", "Medium", OperationsId, null);

        using var patch = await _factory.Client.PatchAsJsonAsync($"/api/v1/work-items/{item.Id}", new
        {
            title = "Updated title",
            description = "Updated description",
            priority = "Critical",
            categoryId = SupportId
        });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<WorkItemResponse>();
        Assert.NotNull(updated);
        Assert.Equal("Updated title", updated.Title);
        Assert.Equal("Critical", updated.Priority);
        Assert.Equal(SupportId, updated.CategoryId);
        Assert.Equal("Support", updated.CategoryName);

        await PostAsync($"/api/v1/work-items/{item.Id}/assign", new { assigneeName = "Ahmad" });
        await PostAsync($"/api/v1/work-items/{item.Id}/assign", new { assigneeName = (string?)null });
        Assert.Equal("InProgress", (await ChangeStatusAsync(item.Id, "InProgress")).Status);
        Assert.Equal("Blocked", (await ChangeStatusAsync(item.Id, "Blocked")).Status);
        Assert.Equal("InProgress", (await ChangeStatusAsync(item.Id, "InProgress")).Status);
        Assert.Equal("Done", (await ChangeStatusAsync(item.Id, "Done")).Status);

        using var invalidTransition = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{item.Id}/status", new { status = "Todo" });
        Assert.Equal(HttpStatusCode.Conflict, invalidTransition.StatusCode);
        Assert.Equal("application/problem+json", invalidTransition.Content.Headers.ContentType?.MediaType);

        var finalDetail = await _factory.Client.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{item.Id}");
        Assert.NotNull(finalDetail);
        Assert.Null(finalDetail.AssigneeName);
        Assert.Equal("Done", finalDetail.Status);

        var events = await _factory.Client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{item.Id}/activity");
        Assert.NotNull(events);
        Assert.Equal(11, events.Length);
        Assert.Contains(events, x => x.EventType == "TitleChanged");
        Assert.Contains(events, x => x.EventType == "DescriptionChanged");
        Assert.Contains(events, x => x.EventType == "PriorityChanged");
        Assert.Contains(events, x => x.EventType == "CategoryChanged");
        Assert.Equal(4, events.Count(x => x.EventType == "StatusChanged"));
        Assert.Equal(2, events.Count(x => x.EventType == "AssignmentChanged"));
        Assert.True(events.Zip(events.Skip(1), (newer, older) => newer.CreatedAtUtc >= older.CreatedAtUtc).All(x => x));
    }

    [Theory]
    [InlineData("Todo")]
    [InlineData("InProgress")]
    [InlineData("Blocked")]
    [InlineData("Done")]
    public async Task SameStateStatusRequest_ReturnsConflict(string status)
    {
        await _factory.ResetDatabaseAsync();
        var item = await CreateAsync($"Same-state {status}", null, "Medium", null, null);
        if (status is "InProgress" or "Blocked" or "Done")
            await ChangeStatusAsync(item.Id, "InProgress");
        if (status == "Blocked")
            await ChangeStatusAsync(item.Id, "Blocked");
        if (status == "Done")
            await ChangeStatusAsync(item.Id, "Done");

        using var response = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{item.Id}/status", new { status });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid Work Item Transition", body.RootElement.GetProperty("title").GetString());
        Assert.Contains($"from {status} to {status}", body.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task StaleConcurrentStatusChange_ConflictsAndRollsBackActivity()
    {
        await _factory.ResetDatabaseAsync();
        var item = await CreateAsync("Concurrent status", null, "Medium", null, null);
        await ChangeStatusAsync(item.Id, "InProgress");

        await using var firstScope = _factory.Services.CreateAsyncScope();
        await using var staleScope = _factory.Services.CreateAsyncScope();
        var firstContext = firstScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var staleContext = staleScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var firstService = firstScope.ServiceProvider.GetRequiredService<IWorkItemService>();
        var staleService = staleScope.ServiceProvider.GetRequiredService<IWorkItemService>();
        var firstRead = await firstContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        var staleRead = await staleContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        var originalVersion = firstRead.Version;
        Assert.Equal(originalVersion, staleRead.Version);
        Assert.Equal(WorkItemStatus.InProgress, firstRead.Status);
        Assert.Equal(WorkItemStatus.InProgress, staleRead.Status);

        var winner = await firstService.ChangeStatusAsync(item.Id, new ChangeWorkItemStatusRequest { Status = "Blocked" });
        Assert.Equal("Blocked", winner?.Status);

        var conflict = await Assert.ThrowsAsync<WorkItemConcurrencyException>(() =>
            staleService.ChangeStatusAsync(item.Id, new ChangeWorkItemStatusRequest { Status = "Done" }));
        Assert.Equal(WorkItemConcurrencyException.ConflictDetail, conflict.Message);
        Assert.Null(conflict.InnerException);

        await using var verificationScope = _factory.Services.CreateAsyncScope();
        var verificationContext = verificationScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var finalItem = await verificationContext.WorkItems.AsNoTracking().SingleAsync(x => x.Id == item.Id);
        var events = await verificationContext.ActivityEvents.AsNoTracking()
            .Where(x => x.WorkItemId == item.Id)
            .ToListAsync();

        Assert.Equal(WorkItemStatus.Blocked, finalItem.Status);
        Assert.Equal(originalVersion + 1, finalItem.Version);
        Assert.Equal(1, events.Count(x => x.Description == "Status changed from InProgress to Blocked"));
        Assert.DoesNotContain(events, x => x.Description == "Status changed from InProgress to Done");
    }

    [Fact]
    public async Task StaleDescriptiveEdit_ConflictsWithAssignmentMutation()
    {
        await _factory.ResetDatabaseAsync();
        var item = await CreateAsync("Original title", "Original description", "Medium", null, null);

        await using var firstScope = _factory.Services.CreateAsyncScope();
        await using var staleScope = _factory.Services.CreateAsyncScope();
        var firstContext = firstScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var staleContext = staleScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var firstService = firstScope.ServiceProvider.GetRequiredService<IWorkItemService>();
        var staleService = staleScope.ServiceProvider.GetRequiredService<IWorkItemService>();
        var firstRead = await firstContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        var staleRead = await staleContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        Assert.Equal(firstRead.Version, staleRead.Version);

        var winner = await firstService.AssignAsync(item.Id, new AssignWorkItemRequest { AssigneeName = "Winner" });
        Assert.Equal("Winner", winner?.AssigneeName);

        var conflict = await Assert.ThrowsAsync<WorkItemConcurrencyException>(() => staleService.UpdateAsync(
            item.Id,
            new UpdateWorkItemRequest
            {
                Title = "Stale title",
                Description = "Stale description",
                Priority = "High"
            }));
        Assert.Equal(WorkItemConcurrencyException.ConflictDetail, conflict.Message);
        Assert.Null(conflict.InnerException);

        await using var verificationScope = _factory.Services.CreateAsyncScope();
        var verificationContext = verificationScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var finalItem = await verificationContext.WorkItems.AsNoTracking().SingleAsync(x => x.Id == item.Id);
        var events = await verificationContext.ActivityEvents.AsNoTracking()
            .Where(x => x.WorkItemId == item.Id)
            .ToListAsync();

        Assert.Equal("Original title", finalItem.Title);
        Assert.Equal("Original description", finalItem.Description);
        Assert.Equal("Winner", finalItem.AssigneeName);
        Assert.DoesNotContain(events, x => x.EventType == ActivityEventType.TitleChanged);
        Assert.Single(events, x => x.EventType == ActivityEventType.AssignmentChanged);
    }

    [Fact]
    public async Task StaleConcurrencyConflictOnStatusRoute_ReturnsSafeProblemDetails()
    {
        using var conflictFactory = _factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IWorkItemService>();
            services.AddScoped<IWorkItemService, ConcurrencyConflictWorkItemService>();
        }));
        using var client = conflictFactory.CreateClient();
        using var response = await client.PostAsJsonAsync($"/api/v1/work-items/{Guid.NewGuid()}/status", new { status = "Done" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Work Item Concurrency Conflict", body.RootElement.GetProperty("title").GetString());
        Assert.Equal(WorkItemConcurrencyException.ConflictDetail, body.RootElement.GetProperty("detail").GetString());
        var responseText = body.RootElement.GetRawText();
        Assert.DoesNotContain(nameof(DbUpdateConcurrencyException), responseText);
    }

    [Fact]
    public async Task List_Search_Filters_Sort_AndPagination_AreServerSide()
    {
        await _factory.ResetDatabaseAsync();
        var alpha = await CreateAsync("Alpha", "login failure", "High", OperationsId, "Alice");
        var bravo = await CreateAsync("Bravo login", "normal", "Low", SupportId, "Bob");
        var charlie = await CreateAsync("Charlie", null, "Medium", OperationsId, "Carol");
        await ChangeStatusAsync(charlie.Id, "InProgress");

        var search = await ListAsync("?search=LOGIN");
        Assert.Equal(2, search.TotalItems);
        Assert.Contains(search.Items, x => x.Id == alpha.Id);
        Assert.Contains(search.Items, x => x.Id == bravo.Id);

        Assert.Equal(alpha.Id, Assert.Single((await ListAsync("?priority=High")).Items).Id);
        Assert.Equal(charlie.Id, Assert.Single((await ListAsync("?status=InProgress")).Items).Id);
        Assert.Equal(2, (await ListAsync($"?categoryId={OperationsId}")).TotalItems);
        Assert.Equal(alpha.Id, Assert.Single((await ListAsync("?assignee=ali")).Items).Id);

        var firstPage = await ListAsync("?sort=title&direction=asc&page=1&pageSize=2");
        Assert.Equal(new[] { "Alpha", "Bravo login" }, firstPage.Items.Select(x => x.Title));
        Assert.Equal(3, firstPage.TotalItems);
        Assert.Equal(2, firstPage.TotalPages);
        var secondPage = await ListAsync("?sort=title&direction=asc&page=2&pageSize=2");
        Assert.Equal(2, secondPage.Page);
        Assert.Equal("Charlie", Assert.Single(secondPage.Items).Title);

        var prioritySort = await ListAsync("?sort=priority&direction=asc");
        Assert.Equal(new[] { "Low", "Medium", "High" }, prioritySort.Items.Select(x => x.Priority));
    }

    [Fact]
    public async Task InvalidInputAndMissingResources_ReturnProblemDetails()
    {
        await _factory.ResetDatabaseAsync();

        using var invalidCreate = await _factory.Client.PostAsJsonAsync("/api/v1/work-items", new { title = " ", priority = "High" });
        Assert.Equal(HttpStatusCode.BadRequest, invalidCreate.StatusCode);
        Assert.Equal("application/problem+json", invalidCreate.Content.Headers.ContentType?.MediaType);
        using var invalidBody = JsonDocument.Parse(await invalidCreate.Content.ReadAsStringAsync());
        Assert.True(invalidBody.RootElement.GetProperty("errors").TryGetProperty("Title", out _));

        using var invalidPriority = await _factory.Client.PostAsJsonAsync("/api/v1/work-items", new { title = "Valid", priority = "Unknown" });
        Assert.Equal(HttpStatusCode.BadRequest, invalidPriority.StatusCode);
        using var invalidPriorityBody = JsonDocument.Parse(await invalidPriority.Content.ReadAsStringAsync());
        Assert.True(invalidPriorityBody.RootElement.GetProperty("errors").TryGetProperty("Priority", out _));

        using var invalidPage = await _factory.Client.GetAsync("/api/v1/work-items?page=0&pageSize=101");
        Assert.Equal(HttpStatusCode.BadRequest, invalidPage.StatusCode);
        using var invalidSort = await _factory.Client.GetAsync("/api/v1/work-items?sort=arbitrary");
        Assert.Equal(HttpStatusCode.BadRequest, invalidSort.StatusCode);

        var missingId = Guid.NewGuid();
        using var missing = await _factory.Client.GetAsync($"/api/v1/work-items/{missingId}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        using var missingCategory = await _factory.Client.PostAsJsonAsync("/api/v1/work-items", new
        {
            title = "Unknown category",
            priority = "Low",
            categoryId = Guid.NewGuid()
        });
        Assert.Equal(HttpStatusCode.NotFound, missingCategory.StatusCode);
    }

    [Fact]
    public async Task MigrationUpAndDown_PreservesExistingWorkItems()
    {
        await _factory.ResetDatabaseAsync();
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var migrator = dbContext.GetService<IMigrator>();
        const string initialMigration = "20260919155806_InitialCreate";

        await migrator.MigrateAsync(initialMigration);
        var existingId = Guid.NewGuid();
        var timestamp = DateTime.UtcNow;
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "WorkItems" ("Id", "Title", "Description", "Status", "Priority", "AssigneeName", "CreatedAtUtc", "UpdatedAtUtc")
            VALUES ({existingId}, {"Legacy item"}, {"Created before Phase 3"}, {"Todo"}, {"Medium"}, {"Ahmad"}, {timestamp}, {timestamp})
            """);

        await migrator.MigrateAsync();
        var migrated = await dbContext.WorkItems.AsNoTracking().SingleAsync(x => x.Id == existingId);
        Assert.Equal("Legacy item", migrated.Title);
        Assert.Equal(1L, migrated.Version);
        Assert.Null(migrated.CategoryId);
        Assert.Equal(4, await dbContext.Categories.CountAsync());

        await migrator.MigrateAsync(initialMigration);
        await dbContext.Database.OpenConnectionAsync();
        await using (var command = dbContext.Database.GetDbConnection().CreateCommand())
        {
            command.CommandText = "SELECT COUNT(*) FROM \"WorkItems\" WHERE \"Id\" = @id";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "id";
            parameter.Value = existingId;
            command.Parameters.Add(parameter);
            Assert.Equal(1L, (long)(await command.ExecuteScalarAsync())!);
        }
        await dbContext.Database.CloseConnectionAsync();
        await migrator.MigrateAsync();
    }

    private async Task<WorkItemResponse> CreateAsync(string title, string? description, string priority, Guid? categoryId, string? assigneeName)
    {
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/work-items", new
        {
            title,
            description,
            priority,
            categoryId,
            assigneeName
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private async Task<WorkItemResponse> ChangeStatusAsync(Guid id, string status)
    {
        using var response = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{id}/status", new { status });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private async Task<PagedResult<WorkItemResponse>> ListAsync(string query)
    {
        return (await _factory.Client.GetFromJsonAsync<PagedResult<WorkItemResponse>>($"/api/v1/work-items{query}"))!;
    }

    private async Task PostAsync(string path, object payload)
    {
        using var response = await _factory.Client.PostAsJsonAsync(path, payload);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private sealed class ConcurrencyConflictWorkItemService : IWorkItemService
    {
        public ConcurrencyConflictWorkItemService()
        {
        }

        public Task<PagedResult<WorkItemResponse>> ListAsync(WorkItemQuery query, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<WorkItemResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<WorkItemResponse> CreateAsync(CreateWorkItemRequest request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<WorkItemResponse?> UpdateAsync(Guid id, UpdateWorkItemRequest request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<WorkItemResponse?> ChangeStatusAsync(Guid id, ChangeWorkItemStatusRequest request, CancellationToken cancellationToken = default) =>
            Task.FromException<WorkItemResponse?>(new WorkItemConcurrencyException());

        public Task<WorkItemResponse?> AssignAsync(Guid id, AssignWorkItemRequest request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<ActivityEventResponse>?> GetActivityAsync(Guid id, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<CategoryResponse>> GetCategoriesAsync(CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
