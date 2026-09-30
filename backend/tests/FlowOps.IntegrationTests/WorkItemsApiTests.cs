using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FlowOps.Application.DTOs;
using FlowOps.Application.Authorization;
using FlowOps.Application.Services;
using FlowOps.Infrastructure.Identity;
using System.Net.Http.Headers;
using Microsoft.Extensions.Logging.Abstractions;
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
    private Guid _actorId;

    public WorkItemsApiTests(FlowOpsApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Categories_Create_Read_AndCreatedActivity_Persist()
    {
        await ResetAsync();

        var categories = await _factory.Client.GetFromJsonAsync<CategoryResponse[]>("/api/v1/categories");
        Assert.NotNull(categories);
        Assert.Equal(new[] { "Billing", "Engineering", "Operations", "Support" }, categories.Select(x => x.Name));

        var created = await CreateAsync("Investigate login", "Intermittent failure", "High", OperationsId, "Ahmad");
        Assert.Equal(1, created.Version);
        Assert.Equal(OperationsId, created.CategoryId);
        Assert.Equal("Operations", created.CategoryName);

        var detail = await _factory.Client.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{created.Id}");
        Assert.NotNull(detail);
        Assert.Equal(created.Version, detail.Version);
        Assert.Equal("Investigate login", detail.Title);
        Assert.Equal("Todo", detail.Status);
        Assert.Equal("Ahmad", detail.AssigneeName);

        var activity = await _factory.Client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{created.Id}/activity");
        Assert.NotNull(activity);
        var initialEvent = Assert.Single(activity);
        Assert.Equal("Created", initialEvent.EventType);
        Assert.Equal(created.Id, initialEvent.WorkItemId);
        Assert.Equal(_actorId, initialEvent.ActorUserId);
        Assert.Equal("Lifecycle administrator", initialEvent.Actor?.DisplayName);
    }

    [Fact]
    public async Task Patch_Assignment_Status_AndActivity_Persist()
    {
        await ResetAsync();
        var item = await CreateAsync("Initial", "Original description", "Medium", OperationsId, null);

        using var patch = await _factory.Client.PatchAsJsonAsync($"/api/v1/work-items/{item.Id}", new
        {
            title = "Updated title",
            description = "Updated description",
            priority = "Critical",
            categoryId = SupportId,
            expectedVersion = item.Version
        });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var updated = await patch.Content.ReadFromJsonAsync<WorkItemResponse>();
        Assert.NotNull(updated);
        Assert.Equal(item.Version + 4, updated.Version);
        Assert.Equal("Updated title", updated.Title);
        Assert.Equal("Critical", updated.Priority);
        Assert.Equal(SupportId, updated.CategoryId);
        Assert.Equal("Support", updated.CategoryName);

        await AssignAsync(item.Id, "Ahmad");
        await AssignAsync(item.Id, null);
        Assert.Equal("InProgress", (await ChangeStatusAsync(item.Id, "InProgress")).Status);
        Assert.Equal("Blocked", (await ChangeStatusAsync(item.Id, "Blocked")).Status);
        Assert.Equal("InProgress", (await ChangeStatusAsync(item.Id, "InProgress")).Status);
        Assert.Equal("Done", (await ChangeStatusAsync(item.Id, "Done")).Status);

        using var invalidTransition = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{item.Id}/status", new { status = "Todo", expectedVersion = (await GetAsync(item.Id)).Version });
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
        await ResetAsync();
        var item = await CreateAsync($"Same-state {status}", null, "Medium", null, null);
        if (status is "InProgress" or "Blocked" or "Done")
            await ChangeStatusAsync(item.Id, "InProgress");
        if (status == "Blocked")
            await ChangeStatusAsync(item.Id, "Blocked");
        if (status == "Done")
            await ChangeStatusAsync(item.Id, "Done");

        using var response = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{item.Id}/status", new { status, expectedVersion = (await GetAsync(item.Id)).Version });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid Work Item Transition", body.RootElement.GetProperty("title").GetString());
        Assert.Contains($"from {status} to {status}", body.RootElement.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task StaleConcurrentStatusChange_ConflictsAndRollsBackActivity()
    {
        await ResetAsync();
        var item = await CreateAsync("Concurrent status", null, "Medium", null, null);
        await ChangeStatusAsync(item.Id, "InProgress");

        await using var firstScope = _factory.Services.CreateAsyncScope();
        await using var staleScope = _factory.Services.CreateAsyncScope();
        var firstContext = firstScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var staleContext = staleScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var firstService = Service(firstScope.ServiceProvider);
        var staleService = Service(staleScope.ServiceProvider);
        var firstRead = await firstContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        var staleRead = await staleContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        var originalVersion = firstRead.Version;
        Assert.Equal(originalVersion, staleRead.Version);
        Assert.Equal(WorkItemStatus.InProgress, firstRead.Status);
        Assert.Equal(WorkItemStatus.InProgress, staleRead.Status);

        var winner = await firstService.ChangeStatusAsync(item.Id, new ChangeWorkItemStatusRequest { Status = "Blocked", ExpectedVersion = originalVersion });
        Assert.Equal("Blocked", winner?.Status);

        var conflict = await Assert.ThrowsAsync<WorkItemConcurrencyException>(() =>
            staleService.ChangeStatusAsync(item.Id, new ChangeWorkItemStatusRequest { Status = "Done", ExpectedVersion = originalVersion }));
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
        await ResetAsync();
        var item = await CreateAsync("Original title", "Original description", "Medium", null, null);

        await using var firstScope = _factory.Services.CreateAsyncScope();
        await using var staleScope = _factory.Services.CreateAsyncScope();
        var firstContext = firstScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var staleContext = staleScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var firstService = Service(firstScope.ServiceProvider);
        var staleService = Service(staleScope.ServiceProvider);
        var firstRead = await firstContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        var staleRead = await staleContext.WorkItems.SingleAsync(x => x.Id == item.Id);
        Assert.Equal(firstRead.Version, staleRead.Version);

        var winner = await firstService.AssignAsync(item.Id, new AssignWorkItemRequest { AssigneeUserId = (await _factory.SeedUserAsync(displayName: "Winner")).Id, ExpectedVersion = firstRead.Version });
        Assert.Equal("Winner", winner?.AssigneeName);

        var conflict = await Assert.ThrowsAsync<WorkItemConcurrencyException>(() => staleService.UpdateAsync(
            item.Id,
            new UpdateWorkItemRequest
            {
                ExpectedVersion = staleRead.Version,
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
        Assert.Equal(winner!.AssigneeUserId, finalItem.AssigneeUserId);
        Assert.Null(finalItem.AssigneeName);
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
        using var client = conflictFactory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = _factory.Client.DefaultRequestHeaders.Authorization ??
            (await _factory.CreateAuthenticatedClientAsync(AppRoles.Admin)).DefaultRequestHeaders.Authorization;
        using var response = await client.PostAsJsonAsync($"/api/v1/work-items/{Guid.NewGuid()}/status", new { status = "Done", expectedVersion = 1 });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Work Item Concurrency Conflict", body.RootElement.GetProperty("title").GetString());
        Assert.Equal(WorkItemConcurrencyException.ConflictDetail, body.RootElement.GetProperty("detail").GetString());
        var responseText = body.RootElement.GetRawText();
        Assert.DoesNotContain(nameof(DbUpdateConcurrencyException), responseText);
    }

    [Theory]
    [InlineData("patch")]
    [InlineData("status")]
    [InlineData("assign")]
    public async Task StaleClientRepresentation_ReturnsConflictAndPreservesWinnerAndActivity(string operation)
    {
        await ResetAsync();
        var created = await CreateAsync("Initial", "Original details", "Medium", OperationsId, "Original assignee");
        Assert.Equal(1, created.Version);
        var clientA = await GetAsync(created.Id);
        Assert.Equal(1, clientA.Version);

        using var winningResponse = await _factory.Client.PatchAsJsonAsync($"/api/v1/work-items/{created.Id}", new
        {
            title = "Winning title",
            description = clientA.Description,
            priority = clientA.Priority,
            categoryId = clientA.CategoryId,
            expectedVersion = clientA.Version
        });
        Assert.Equal(HttpStatusCode.OK, winningResponse.StatusCode);
        var winner = (await winningResponse.Content.ReadFromJsonAsync<WorkItemResponse>())!;
        Assert.Equal(2, winner.Version);
        // Compare persisted representations, including the database's stored timestamps.
        var persistedWinner = await GetAsync(created.Id);
        Assert.Equal(winner.Version, persistedWinner.Version);
        Assert.Equal("Winning title", persistedWinner.Title);
        var beforeActivity = (await _factory.Client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{created.Id}/activity"))!;

        using var staleResponse = operation switch
        {
            "patch" => await _factory.Client.PatchAsJsonAsync($"/api/v1/work-items/{created.Id}", new
            {
                title = "Stale title",
                description = "Stale details",
                priority = "Critical",
                categoryId = SupportId,
                expectedVersion = clientA.Version
            }),
            "status" => await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{created.Id}/status", new { status = "InProgress", expectedVersion = clientA.Version }),
            _ => await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{created.Id}/assign", new { assigneeUserId = (await _factory.SeedUserAsync(displayName: "Stale assignee")).Id, expectedVersion = clientA.Version })
        };

        Assert.Equal(HttpStatusCode.Conflict, staleResponse.StatusCode);
        Assert.Equal("application/problem+json", staleResponse.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await staleResponse.Content.ReadAsStringAsync());
        Assert.Equal("Work Item Concurrency Conflict", problem.RootElement.GetProperty("title").GetString());
        Assert.Equal(WorkItemConcurrencyException.ConflictDetail, problem.RootElement.GetProperty("detail").GetString());
        Assert.DoesNotContain("expectedVersion", problem.RootElement.GetRawText());
        Assert.DoesNotContain(nameof(DbUpdateConcurrencyException), problem.RootElement.GetRawText());

        var final = await GetAsync(created.Id);
        Assert.Equal(JsonSerializer.Serialize(persistedWinner), JsonSerializer.Serialize(final));
        var finalActivity = (await _factory.Client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{created.Id}/activity"))!;
        Assert.Equal(beforeActivity.Select(x => x.Id), finalActivity.Select(x => x.Id));
        Assert.Equal(new[] { "TitleChanged", "Created" }, finalActivity.Select(x => x.EventType));
        var list = await ListAsync("");
        Assert.Equal(2, Assert.Single(list.Items).Version);
    }

    [Theory]
    [InlineData("patch", null)]
    [InlineData("patch", "0")]
    [InlineData("patch", "-1")]
    [InlineData("patch", "\"invalid\"")]
    [InlineData("status", null)]
    [InlineData("status", "0")]
    [InlineData("status", "-1")]
    [InlineData("status", "\"invalid\"")]
    [InlineData("assign", null)]
    [InlineData("assign", "0")]
    [InlineData("assign", "-1")]
    [InlineData("assign", "\"invalid\"")]
    public async Task InvalidExpectedVersion_ReturnsValidationProblem(string operation, string? versionJson)
    {
        await ResetAsync();
        var item = await CreateAsync("Validation item", null, "Medium", null, null);
        Dictionary<string, object?> payload = operation switch
        {
            "patch" => new() { ["title"] = "Updated", ["priority"] = "High" },
            "status" => new() { ["status"] = "InProgress" },
            "assign" => new() { ["assigneeUserId"] = (await _factory.SeedUserAsync(displayName: "Assignee")).Id },
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };
        if (versionJson is not null) payload["expectedVersion"] = JsonSerializer.Deserialize<JsonElement>(versionJson);
        var path = $"/api/v1/work-items/{item.Id}" + (operation == "patch" ? "" : $"/{operation}");
        using var request = new HttpRequestMessage(operation == "patch" ? HttpMethod.Patch : HttpMethod.Post, path)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json")
        };
        using var response = await _factory.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Contains(problem.RootElement.GetProperty("errors").EnumerateObject(),
            field => field.Name.EndsWith("expectedVersion", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(1, (await GetAsync(item.Id)).Version);
        Assert.Single((await _factory.Client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{item.Id}/activity"))!);
    }

    [Theory]
    [InlineData("Unknown")]
    [InlineData("999")]
    public async Task InvalidStatus_ReturnsFieldValidationProblem_WithoutMutationOrActivity(string status)
    {
        await ResetAsync();
        var item = await CreateAsync("Status validation", null, "Medium", null, null);
        var before = await GetAsync(item.Id);

        using var response = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{item.Id}/status",
            new { status, expectedVersion = before.Version });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var problem = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(problem.RootElement.GetProperty("errors").TryGetProperty("Status", out _));
        var after = await GetAsync(item.Id);
        Assert.Equal(before.Status, after.Status);
        Assert.Equal(before.Version, after.Version);
        Assert.Equal(before.UpdatedAtUtc, after.UpdatedAtUtc);
        Assert.Single((await _factory.Client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{item.Id}/activity"))!);
    }

    [Fact]
    public async Task List_Search_Filters_Sort_AndPagination_AreServerSide()
    {
        await ResetAsync();
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
        await ResetAsync();

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
        await ResetAsync();
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
        var assigneeUserId = assigneeName is null ? (Guid?)null : (await _factory.SeedUserAsync(displayName: assigneeName)).Id;
        using var response = await _factory.Client.PostAsJsonAsync("/api/v1/work-items", new
        {
            title,
            description,
            priority,
            categoryId,
            assigneeUserId
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private async Task<WorkItemResponse> ChangeStatusAsync(Guid id, string status)
    {
        using var response = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{id}/status", new { status, expectedVersion = (await GetAsync(id)).Version });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private async Task<PagedResult<WorkItemResponse>> ListAsync(string query)
    {
        return (await _factory.Client.GetFromJsonAsync<PagedResult<WorkItemResponse>>($"/api/v1/work-items{query}"))!;
    }

    private async Task<WorkItemResponse> GetAsync(Guid id) =>
        (await _factory.Client.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{id}"))!;

    private async Task<WorkItemResponse> AssignAsync(Guid id, string? assigneeName)
    {
        var assigneeUserId = assigneeName is null ? (Guid?)null : (await _factory.SeedUserAsync(displayName: assigneeName)).Id;
        using var response = await _factory.Client.PostAsJsonAsync($"/api/v1/work-items/{id}/assign",
            new { assigneeUserId, expectedVersion = (await GetAsync(id)).Version });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private async Task ResetAsync()
    {
        await _factory.ResetDatabaseAsync();
        var user = await _factory.SeedUserAsync(AppRoles.Admin, displayName: "Lifecycle administrator");
        _actorId = user.Id;
        using var authenticated = await _factory.CreateAuthenticatedClientAsync(user);
        _factory.Client.DefaultRequestHeaders.Authorization = authenticated.DefaultRequestHeaders.Authorization;
    }

    private IWorkItemService Service(IServiceProvider provider) => new WorkItemService(
        provider.GetRequiredService<IWorkItemStore>(), NullLogger<WorkItemService>.Instance,
        new ScopeCurrentUser(_actorId), provider.GetRequiredService<IUserDirectory>());

    private sealed class ScopeCurrentUser(Guid userId) : ICurrentUser
    {
        public Guid? UserId => userId;
        public string? DisplayName => "Lifecycle administrator";
        public IReadOnlyList<string> Roles => [AppRoles.Admin];
        public bool IsAuthenticated => true;
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

        public Task<IReadOnlyList<CommentResponse>?> GetCommentsAsync(Guid id, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<CommentResponse?> AddCommentAsync(Guid id, CreateCommentRequest request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<IReadOnlyList<CategoryResponse>> GetCategoriesAsync(CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }
}
