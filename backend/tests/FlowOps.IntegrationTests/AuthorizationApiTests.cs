using System.Net;
using System.Net.Http.Json;
using FlowOps.Application.Authorization;
using FlowOps.Application.DTOs;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using FlowOps.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace FlowOps.IntegrationTests;

public class AuthorizationApiTests : IClassFixture<FlowOpsApiFactory>
{
    private readonly FlowOpsApiFactory _factory;

    public AuthorizationApiTests(FlowOpsApiFactory factory) => _factory = factory;

    [Theory]
    [InlineData("list")]
    [InlineData("create")]
    [InlineData("detail")]
    [InlineData("activity")]
    [InlineData("categories")]
    [InlineData("edit")]
    [InlineData("status")]
    [InlineData("assign")]
    public async Task WorkItemRoutes_AnonymousRequests_ReturnUnauthorized(string operation)
    {
        var id = Guid.NewGuid();
        using var response = operation switch
        {
            "list" => await _factory.Client.GetAsync("/api/v1/work-items"),
            "create" => await _factory.Client.PostAsJsonAsync("/api/v1/work-items", new { title = "Anonymous", priority = "Medium" }),
            "detail" => await _factory.Client.GetAsync($"/api/v1/work-items/{id}"),
            "activity" => await _factory.Client.GetAsync($"/api/v1/work-items/{id}/activity"),
            "categories" => await _factory.Client.GetAsync("/api/v1/categories"),
            _ => await MutateAsync(_factory.Client, id, operation, 1, null)
        };

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(AppRoles.Member)]
    [InlineData(AppRoles.Admin)]
    public async Task AuthenticatedRoles_CanCreateAndRead_WithTrustedCreatorAndActor(string role)
    {
        await _factory.ResetDatabaseAsync();
        var user = await _factory.SeedUserAsync(role, displayName: $"{role} creator");
        using var client = await _factory.CreateAuthenticatedClientAsync(user);
        var item = await CreateAsync(client);

        Assert.Equal(user.Id, item.CreatedByUserId);
        Assert.Equal(user.Id, item.CreatedBy?.Id);
        Assert.Equal(user.DisplayName, item.CreatedBy?.DisplayName);
        Assert.Null(item.AssigneeUserId);
        Assert.Null(item.Assignee);
        Assert.Null(item.LegacyAssigneeName);
        Assert.True(item.Permissions?.CanEdit);
        Assert.True(item.Permissions?.CanChangeStatus);
        Assert.True(item.Permissions?.CanSelfAssign);
        Assert.Equal(role == AppRoles.Admin, item.Permissions?.CanAssignOthers);

        using var list = await client.GetAsync("/api/v1/work-items");
        using var detail = await client.GetAsync($"/api/v1/work-items/{item.Id}");
        using var categories = await client.GetAsync("/api/v1/categories");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        Assert.Equal(HttpStatusCode.OK, categories.StatusCode);
        var activity = await ActivityAsync(client, item.Id);
        var created = Assert.Single(activity);
        Assert.Equal("Created", created.EventType);
        Assert.Equal(user.Id, created.ActorUserId);
        Assert.Equal(user.Id, created.Actor?.Id);
        Assert.Equal(user.DisplayName, created.ActorDisplayName);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        Assert.Equal(user.Id, (await db.WorkItems.AsNoTracking().SingleAsync(row => row.Id == item.Id)).CreatedByUserId);
        Assert.Equal(user.Id, (await db.ActivityEvents.AsNoTracking().SingleAsync(row => row.WorkItemId == item.Id)).ActorUserId);
    }

    [Theory]
    [InlineData("createdByUserId")]
    [InlineData("actorUserId")]
    [InlineData("role")]
    [InlineData("assigneeName")]
    public async Task Create_RejectsSpoofedIdentityAndLegacyAssignmentFields(string field)
    {
        await _factory.ResetDatabaseAsync();
        using var client = await _factory.CreateAuthenticatedClientAsync();
        var payload = new Dictionary<string, object?> { ["title"] = "Spoofed", ["priority"] = "Medium", [field] = field == "role" ? "Admin" : Guid.NewGuid().ToString() };
        using var response = await client.PostAsJsonAsync("/api/v1/work-items", payload);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertSafeProblemAsync(response);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        Assert.Empty(await db.WorkItems.ToListAsync());
        Assert.Empty(await db.ActivityEvents.ToListAsync());
    }

    [Theory]
    [InlineData("creator", "edit")]
    [InlineData("creator", "status")]
    [InlineData("assignee", "edit")]
    [InlineData("assignee", "status")]
    [InlineData("admin", "edit")]
    [InlineData("admin", "status")]
    public async Task AuthorizedCreatorAssigneeAndAdmin_CanMutate_AndActivityUsesCaller(string actorKind, string operation)
    {
        await _factory.ResetDatabaseAsync();
        var creator = await _factory.SeedUserAsync(displayName: "Creator");
        var assignee = await _factory.SeedUserAsync(displayName: "Assigned member");
        var admin = await _factory.SeedUserAsync(AppRoles.Admin, displayName: "Administrator");
        using var creatorClient = await _factory.CreateAuthenticatedClientAsync(creator);
        using var adminClient = await _factory.CreateAuthenticatedClientAsync(admin);
        var item = await CreateAsync(creatorClient);
        item = await AssignAsync(adminClient, item, assignee.Id);
        var actor = actorKind switch { "creator" => creator, "assignee" => assignee, _ => admin };
        using var actorClient = await _factory.CreateAuthenticatedClientAsync(actor);
        var before = await GetAsync(actorClient, item.Id);
        Assert.True(before.Permissions?.CanEdit);
        Assert.True(before.Permissions?.CanChangeStatus);

        using var response = await MutateAsync(actorClient, item.Id, operation, item.Version);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
        Assert.Equal(item.Version + 1, updated.Version);
        Assert.Equal(operation == "edit" ? "Updated title" : item.Title, updated.Title);
        Assert.Equal(operation == "status" ? "InProgress" : "Todo", updated.Status);
        var mutation = Assert.Single(await ActivityAsync(actorClient, item.Id), row => row.EventType == (operation == "edit" ? "TitleChanged" : "StatusChanged"));
        Assert.Equal(actor.Id, mutation.ActorUserId);
        Assert.Equal(actor.Id, mutation.Actor?.Id);
        Assert.Equal(actor.DisplayName, mutation.ActorDisplayName);
    }

    [Theory]
    [InlineData("edit", false)]
    [InlineData("edit", true)]
    [InlineData("status", false)]
    [InlineData("status", true)]
    public async Task UnrelatedMember_IsForbiddenBeforeConcurrencyValidation_AndPersistsNoChanges(string operation, bool stale)
    {
        await _factory.ResetDatabaseAsync();
        using var creatorClient = await _factory.CreateAuthenticatedClientAsync();
        using var unrelatedClient = await _factory.CreateAuthenticatedClientAsync();
        var item = await CreateAsync(creatorClient);
        var unrelatedView = await GetAsync(unrelatedClient, item.Id);
        Assert.False(unrelatedView.Permissions?.CanEdit);
        Assert.False(unrelatedView.Permissions?.CanChangeStatus);
        var before = await SnapshotAsync(item.Id);

        using var response = await MutateAsync(unrelatedClient, item.Id, operation, stale ? item.Version + 10 : item.Version);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        await AssertSafeProblemAsync(response);
        Assert.Equal(before, await SnapshotAsync(item.Id));
    }

    [Fact]
    public async Task Member_CanSelfAssignAndSelfUnassign_WithoutOwningItem()
    {
        await _factory.ResetDatabaseAsync();
        using var creatorClient = await _factory.CreateAuthenticatedClientAsync();
        var member = await _factory.SeedUserAsync(displayName: "Self-assignee");
        using var memberClient = await _factory.CreateAuthenticatedClientAsync(member);
        var item = await CreateAsync(creatorClient);
        var before = await GetAsync(memberClient, item.Id);
        Assert.False(before.Permissions?.CanEdit);
        Assert.True(before.Permissions?.CanSelfAssign);
        Assert.False(before.Permissions?.CanAssignOthers);

        item = await AssignAsync(memberClient, item, member.Id);
        Assert.Equal(member.Id, item.AssigneeUserId);
        Assert.Equal(member.Id, item.Assignee?.Id);
        Assert.Equal(member.DisplayName, item.AssigneeName);
        Assert.True(item.Permissions?.CanEdit);
        Assert.True(item.Permissions?.CanUnassign);
        Assert.False(item.Permissions?.CanSelfAssign);
        item = await AssignAsync(memberClient, item, null);
        Assert.Null(item.AssigneeUserId);
        Assert.Null(item.Assignee);
        Assert.False(item.Permissions?.CanEdit);
        Assert.True(item.Permissions?.CanSelfAssign);
        Assert.Equal(3, item.Version);
        var assignments = (await ActivityAsync(memberClient, item.Id)).Where(row => row.EventType == "AssignmentChanged").ToArray();
        Assert.Equal(2, assignments.Length);
        Assert.All(assignments, row => Assert.Equal(member.Id, row.ActorUserId));
    }

    [Theory]
    [InlineData("assign-other")]
    [InlineData("steal")]
    [InlineData("unassign-other")]
    public async Task Member_CannotAssignOtherUsersOrChangeAnotherPersonsAssignment(string operation)
    {
        await _factory.ResetDatabaseAsync();
        var member = await _factory.SeedUserAsync();
        var other = await _factory.SeedUserAsync();
        using var memberClient = await _factory.CreateAuthenticatedClientAsync(member);
        using var adminClient = await _factory.CreateAuthenticatedClientAsync(AppRoles.Admin);
        var item = await CreateAsync(memberClient);
        if (operation != "assign-other") item = await AssignAsync(adminClient, item, other.Id);
        var before = await SnapshotAsync(item.Id);
        var target = operation switch { "assign-other" => other.Id, "steal" => member.Id, _ => (Guid?)null };

        using var response = await MutateAsync(memberClient, item.Id, "assign", item.Version, target);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(before, await SnapshotAsync(item.Id));
    }

    [Fact]
    public async Task Admin_CanAssignReassignAndUnassign_AnyActiveUser()
    {
        await _factory.ResetDatabaseAsync();
        var admin = await _factory.SeedUserAsync(AppRoles.Admin, displayName: "Assignment administrator");
        var first = await _factory.SeedUserAsync(displayName: "First member");
        var second = await _factory.SeedUserAsync(displayName: "Second member");
        using var creatorClient = await _factory.CreateAuthenticatedClientAsync();
        using var adminClient = await _factory.CreateAuthenticatedClientAsync(admin);
        var item = await CreateAsync(creatorClient);

        item = await AssignAsync(adminClient, item, first.Id);
        Assert.Equal(first.Id, item.Assignee?.Id);
        item = await AssignAsync(adminClient, item, second.Id);
        Assert.Equal(second.Id, item.Assignee?.Id);
        Assert.Equal(second.DisplayName, item.AssigneeName);
        item = await AssignAsync(adminClient, item, null);
        Assert.Null(item.AssigneeUserId);
        Assert.Equal(4, item.Version);
        Assert.True(item.Permissions?.CanAssignOthers);
        var assignments = (await ActivityAsync(adminClient, item.Id)).Where(row => row.EventType == "AssignmentChanged").ToArray();
        Assert.Equal(3, assignments.Length);
        Assert.All(assignments, row => Assert.Equal(admin.Id, row.ActorUserId));
        Assert.Contains(assignments, row => row.Description == "Reassigned from First member to Second member");
    }

    [Theory]
    [InlineData("missing", "create")]
    [InlineData("inactive", "create")]
    [InlineData("missing", "assign")]
    [InlineData("inactive", "assign")]
    public async Task Admin_AssigningMissingOrInactiveUser_ReturnsNotFoundAndNoMutation(string targetKind, string operation)
    {
        await _factory.ResetDatabaseAsync();
        using var adminClient = await _factory.CreateAuthenticatedClientAsync(AppRoles.Admin);
        var targetId = targetKind == "missing" ? Guid.NewGuid() : (await _factory.SeedUserAsync(isActive: false)).Id;
        var item = operation == "assign" ? await CreateAsync(adminClient) : null;
        var before = item is not null ? await SnapshotAsync(item.Id) : null;
        using var response = operation == "create"
            ? await adminClient.PostAsJsonAsync("/api/v1/work-items", new { title = "Invalid assignee", priority = "Medium", assigneeUserId = targetId })
            : await MutateAsync(adminClient, item!.Id, "assign", item.Version, targetId);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertSafeProblemAsync(response);
        if (item is not null) Assert.Equal(before, await SnapshotAsync(item.Id));
        else
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
            Assert.Empty(await db.WorkItems.ToListAsync());
            Assert.Empty(await db.ActivityEvents.ToListAsync());
        }
    }

    [Fact]
    public async Task Member_CannotInitiallyAssignAnotherUser_AndCanInitiallyAssignSelf()
    {
        await _factory.ResetDatabaseAsync();
        var member = await _factory.SeedUserAsync();
        var other = await _factory.SeedUserAsync();
        using var client = await _factory.CreateAuthenticatedClientAsync(member);
        using var forbidden = await client.PostAsJsonAsync("/api/v1/work-items", new { title = "Invalid assignment", priority = "Medium", assigneeUserId = other.Id });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var item = await CreateAsync(client, member.Id);
        Assert.Equal(member.Id, item.CreatedByUserId);
        Assert.Equal(member.Id, item.AssigneeUserId);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        Assert.Single(await db.WorkItems.ToListAsync());
        Assert.Single(await db.ActivityEvents.ToListAsync());
    }

    [Theory]
    [InlineData("edit")]
    [InlineData("status")]
    [InlineData("assign")]
    public async Task AllowedStaleMutation_ReturnsConflict_WithNoGhostActivity(string operation)
    {
        await _factory.ResetDatabaseAsync();
        var creator = await _factory.SeedUserAsync();
        using var client = await _factory.CreateAuthenticatedClientAsync(creator);
        var stale = await CreateAsync(client);
        using var winningResponse = await MutateAsync(client, stale.Id, "edit", stale.Version);
        Assert.Equal(HttpStatusCode.OK, winningResponse.StatusCode);
        var before = await SnapshotAsync(stale.Id);

        using var response = await MutateAsync(client, stale.Id, operation, stale.Version, creator.Id);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertSafeProblemAsync(response);
        Assert.Equal(before, await SnapshotAsync(stale.Id));
    }

    [Fact]
    public async Task LegacyName_DoesNotGrantOwnership_AdminCanEdit_AndMemberCanLegitimatelySelfAssign()
    {
        await _factory.ResetDatabaseAsync();
        var member = await _factory.SeedUserAsync(displayName: "Legacy matching name");
        var admin = await _factory.SeedUserAsync(AppRoles.Admin);
        using var memberClient = await _factory.CreateAuthenticatedClientAsync(member);
        using var adminClient = await _factory.CreateAuthenticatedClientAsync(admin);
        var legacy = new WorkItem("Legacy record", assigneeName: member.DisplayName);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
            db.WorkItems.Add(legacy);
            db.ActivityEvents.Add(new ActivityEvent(legacy.Id, ActivityEventType.Created, "Historical creation"));
            await db.SaveChangesAsync();
        }

        var view = await GetAsync(memberClient, legacy.Id);
        Assert.Null(view.CreatedBy);
        Assert.Null(view.Assignee);
        Assert.Equal(member.DisplayName, view.LegacyAssigneeName);
        Assert.Equal(member.DisplayName, view.AssigneeName);
        Assert.False(view.Permissions?.CanEdit);
        using var forbidden = await MutateAsync(memberClient, legacy.Id, "edit", view.Version);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        using var adminEdit = await MutateAsync(adminClient, legacy.Id, "edit", view.Version);
        Assert.Equal(HttpStatusCode.OK, adminEdit.StatusCode);
        view = (await adminEdit.Content.ReadFromJsonAsync<WorkItemResponse>())!;
        view = await AssignAsync(memberClient, view, member.Id);
        Assert.True(view.Permissions?.CanEdit);
        Assert.Equal(member.Id, view.Assignee?.Id);
        Assert.Equal(member.DisplayName, view.LegacyAssigneeName);
        var events = await ActivityAsync(memberClient, legacy.Id);
        Assert.Equal("System", events.Single(row => row.ActorUserId is null).ActorDisplayName);
        Assert.Equal(admin.Id, events.Single(row => row.EventType == "TitleChanged").ActorUserId);
        Assert.Equal(member.Id, events.Single(row => row.EventType == "AssignmentChanged").ActorUserId);
    }

    [Theory]
    [InlineData("detail")]
    [InlineData("activity")]
    [InlineData("edit")]
    [InlineData("status")]
    [InlineData("assign")]
    public async Task MissingResources_ReturnNotFoundForAuthenticatedUser(string operation)
    {
        using var client = await _factory.CreateAuthenticatedClientAsync();
        var id = Guid.NewGuid();
        using var response = operation switch
        {
            "detail" => await client.GetAsync($"/api/v1/work-items/{id}"),
            "activity" => await client.GetAsync($"/api/v1/work-items/{id}/activity"),
            _ => await MutateAsync(client, id, operation, 1)
        };
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task MalformedRouteGuidAndBodyGuid_ReturnExpectedClientErrors()
    {
        using var client = await _factory.CreateAuthenticatedClientAsync(AppRoles.Admin);
        using var invalidRoute = await client.GetAsync("/api/v1/work-items/not-a-guid");
        Assert.Equal(HttpStatusCode.NotFound, invalidRoute.StatusCode);
        using var invalidBody = await client.PostAsJsonAsync("/api/v1/work-items", new { title = "Malformed assignee", priority = "Medium", assigneeUserId = "not-a-guid" });
        Assert.Equal(HttpStatusCode.BadRequest, invalidBody.StatusCode);
        await AssertSafeProblemAsync(invalidBody);
    }

    [Fact]
    public async Task EveryDetailChange_RecordsAuthenticatedActor_AndSummariesContainOnlySafeFields()
    {
        await _factory.ResetDatabaseAsync();
        var member = await _factory.SeedUserAsync(displayName: "Detail editor");
        using var client = await _factory.CreateAuthenticatedClientAsync(member);
        var item = await CreateAsync(client, member.Id);
        using var response = await client.PatchAsJsonAsync($"/api/v1/work-items/{item.Id}", new
        {
            title = "All details updated",
            description = "Changed description",
            priority = "High",
            categoryId = Guid.Parse("10000000-0000-0000-0000-000000000001"),
            expectedVersion = item.Version
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
        Assert.Equal(5, updated.Version);
        var events = await ActivityAsync(client, item.Id);
        Assert.Equal(new[] { "CategoryChanged", "Created", "DescriptionChanged", "PriorityChanged", "TitleChanged" }, events.Select(row => row.EventType).Order());
        Assert.All(events, row => Assert.Equal(member.Id, row.ActorUserId));
        using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        foreach (var field in new[] { "createdBy", "assignee" })
            Assert.Equal(new[] { "displayName", "id" }, body.RootElement.GetProperty(field).EnumerateObject().Select(property => property.Name).Order());
        var activityBody = await client.GetStringAsync($"/api/v1/work-items/{item.Id}/activity");
        Assert.DoesNotContain("passwordHash", activityBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityStamp", activityBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(member.Email!, activityBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task EmptyAssigneeGuid_ReturnsValidationProblemWithoutChangingAssignment()
    {
        await _factory.ResetDatabaseAsync();
        using var client = await _factory.CreateAuthenticatedClientAsync(AppRoles.Admin);
        var item = await CreateAsync(client);
        var before = await SnapshotAsync(item.Id);
        using var response = await MutateAsync(client, item.Id, "assign", item.Version, Guid.Empty);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertSafeProblemAsync(response);
        Assert.Equal(before, await SnapshotAsync(item.Id));
    }

    private static async Task<WorkItemResponse> CreateAsync(HttpClient client, Guid? assigneeUserId = null)
    {
        using var response = await client.PostAsJsonAsync("/api/v1/work-items", new { title = "Initial title", priority = "Medium", assigneeUserId });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private static async Task<WorkItemResponse> AssignAsync(HttpClient client, WorkItemResponse item, Guid? userId)
    {
        using var response = await MutateAsync(client, item.Id, "assign", item.Version, userId);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private static Task<HttpResponseMessage> MutateAsync(HttpClient client, Guid id, string operation, long version, Guid? targetUserId = null) =>
        operation switch
        {
            "edit" => client.PatchAsJsonAsync($"/api/v1/work-items/{id}", new { title = "Updated title", priority = "Medium", expectedVersion = version }),
            "status" => client.PostAsJsonAsync($"/api/v1/work-items/{id}/status", new { status = "InProgress", expectedVersion = version }),
            _ => client.PostAsJsonAsync($"/api/v1/work-items/{id}/assign", new { assigneeUserId = targetUserId, expectedVersion = version })
        };

    private static async Task<WorkItemResponse> GetAsync(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{id}"))!;

    private static async Task<ActivityEventResponse[]> ActivityAsync(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{id}/activity"))!;

    private async Task<PersistedSnapshot> SnapshotAsync(Guid id)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var item = await db.WorkItems.AsNoTracking().SingleAsync(row => row.Id == id);
        var events = await db.ActivityEvents.AsNoTracking().Where(row => row.WorkItemId == id).OrderBy(row => row.Id).Select(row => row.Id).ToArrayAsync();
        return new(item.Version, item.Title, item.Description, item.Status, item.Priority, item.CreatedByUserId, item.AssigneeUserId,
            item.UpdatedAtUtc, string.Join(",", events));
    }

    private sealed record PersistedSnapshot(long Version, string Title, string? Description, WorkItemStatus Status,
        WorkItemPriority Priority, Guid? CreatedByUserId, Guid? AssigneeUserId, DateTime UpdatedAtUtc, string ActivityIds);

    private static async Task AssertSafeProblemAsync(HttpResponseMessage response)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("stackTrace", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DbUpdateConcurrencyException", body, StringComparison.Ordinal);
        Assert.DoesNotContain("passwordHash", body, StringComparison.OrdinalIgnoreCase);
    }
}
