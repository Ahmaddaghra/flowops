using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FlowOps.Application.Authorization;
using FlowOps.Application.DTOs;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using FlowOps.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace FlowOps.IntegrationTests;

public class CommentsApiTests(FlowOpsApiFactory factory) : IClassFixture<FlowOpsApiFactory>
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Anonymous_GetAndPost_RequireAuthentication(bool post)
    {
        using var response = post
            ? await factory.Client.PostAsJsonAsync(Route(Guid.NewGuid()), new { body = "Anonymous" })
            : await factory.Client.GetAsync(Route(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InvalidSession_GetAndPost_ReturnUnauthorized(bool post)
    {
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "invalid-test-session");
        using var response = post
            ? await client.PostAsJsonAsync(Route(Guid.NewGuid()), new { body = "Invalid session" })
            : await client.GetAsync(Route(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InactiveAccount_IssuedTokenFollowsExistingWorkItemReadBoundary(bool post)
    {
        await factory.ResetDatabaseAsync();
        var user = await factory.SeedUserAsync();
        using var client = await factory.CreateAuthenticatedClientAsync(user);
        var item = await CreateItemAsync(client);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        await db.Users.Where(row => row.Id == user.Id).ExecuteUpdateAsync(update => update.SetProperty(row => row.IsActive, false));
        using var readableItem = await client.GetAsync($"/api/v1/work-items/{item.Id}");
        Assert.Equal(HttpStatusCode.OK, readableItem.StatusCode);
        using var currentUser = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, currentUser.StatusCode);
        using var response = post
            ? await client.PostAsJsonAsync(Route(item.Id), new { body = "Inactive session" })
            : await client.GetAsync(Route(item.Id));
        // Existing signed JWTs keep their claims until expiry; comments use the same read boundary.
        Assert.Equal(post ? HttpStatusCode.Created : HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(post ? 1 : 0, await db.Comments.CountAsync());
        Assert.Equal(post ? 1 : 0, await db.ActivityEvents.CountAsync(activity => activity.EventType == ActivityEventType.CommentAdded));
    }

    [Theory]
    [InlineData(AppRoles.Member)]
    [InlineData(AppRoles.Admin)]
    public async Task AuthenticatedReadableItem_ReturnsEmptyOrderedList(string role)
    {
        await factory.ResetDatabaseAsync();
        using var creator = await factory.CreateAuthenticatedClientAsync();
        var item = await CreateItemAsync(creator);
        using var reader = await factory.CreateAuthenticatedClientAsync(role);
        using var response = await reader.GetAsync(Route(item.Id));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadFromJsonAsync<CommentResponse[]>())!);
    }

    [Theory]
    [InlineData(AppRoles.Member, false)]
    [InlineData(AppRoles.Admin, false)]
    [InlineData(AppRoles.Member, true)]
    [InlineData(AppRoles.Admin, true)]
    public async Task AnyAuthenticatedReader_CanCommentWithoutLifecyclePermission_AndAuthorComesFromJwt(string role, bool legacy)
    {
        await factory.ResetDatabaseAsync();
        using var creator = await factory.CreateAuthenticatedClientAsync();
        var author = await factory.SeedUserAsync(role, displayName: "Comment author");
        using var client = await factory.CreateAuthenticatedClientAsync(author);
        Guid itemId;
        if (legacy)
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
            var item = new WorkItem("Historical readable item", assigneeName: "Historical author name");
            db.WorkItems.Add(item);
            await db.SaveChangesAsync();
            itemId = item.Id;
        }
        else itemId = (await CreateItemAsync(creator)).Id;
        var before = (await client.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{itemId}"))!;
        if (role == AppRoles.Member)
        {
            Assert.False(before.Permissions!.CanEdit);
            Assert.False(before.Permissions.CanChangeStatus);
        }
        const string body = "Investigated the report.\nNext step: contact support.";
        using var posted = await client.PostAsJsonAsync(Route(itemId), new { body = " \n" + body + "\t " });
        Assert.Equal(HttpStatusCode.Created, posted.StatusCode);
        Assert.NotNull(posted.Headers.Location);
        var comment = (await posted.Content.ReadFromJsonAsync<CommentResponse>())!;
        Assert.NotEqual(Guid.Empty, comment.Id);
        Assert.Equal(itemId, comment.WorkItemId);
        Assert.Equal(body, comment.Body);
        Assert.Equal(author.Id, comment.Author.Id);
        Assert.Equal(author.DisplayName, comment.Author.DisplayName);
        Assert.Equal(DateTimeKind.Utc, comment.CreatedAtUtc.Kind);
        var retrieved = Assert.Single((await client.GetFromJsonAsync<CommentResponse[]>(Route(itemId)))!);
        Assert.Equal(comment.Id, retrieved.Id);
        Assert.Equal(body, retrieved.Body);
        var after = (await client.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{itemId}"))!;
        Assert.Equal(before.Version, after.Version);
        Assert.Equal(before.UpdatedAtUtc, after.UpdatedAtUtc);
        Assert.Equal(before.Permissions, after.Permissions);
        var activity = Assert.Single((await client.GetFromJsonAsync<ActivityEventResponse[]>($"/api/v1/work-items/{itemId}/activity"))!, row => row.EventType == "CommentAdded");
        Assert.Equal("Comment added", activity.Description);
        Assert.DoesNotContain(body, activity.Description);
        Assert.Equal(author.Id, activity.ActorUserId);
        Assert.Equal(author.DisplayName, activity.ActorDisplayName);
        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var persisted = Assert.Single(await verifyDb.Comments.AsNoTracking().ToListAsync());
        Assert.Equal(author.Id, persisted.AuthorUserId);
        Assert.Equal(comment.CreatedAtUtc, persisted.CreatedAtUtc);
    }

    [Fact]
    public async Task AuthorDto_IsSafe_AndHistoricalAuthorNameSurvivesDeactivation()
    {
        await factory.ResetDatabaseAsync();
        var author = await factory.SeedUserAsync(displayName: "Visible author");
        using var client = await factory.CreateAuthenticatedClientAsync(author);
        var item = await CreateItemAsync(client);
        using var posted = await client.PostAsJsonAsync(Route(item.Id), new { body = "Plain text <script>example</script>" });
        Assert.Equal(HttpStatusCode.Created, posted.StatusCode);
        var payload = await posted.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(new[] { "author", "body", "createdAtUtc", "id", "workItemId" }, payload.EnumerateObject().Select(property => property.Name).Order().ToArray());
        Assert.Equal(new[] { "displayName", "id" }, payload.GetProperty("author").EnumerateObject().Select(property => property.Name).Order().ToArray());
        using var reader = await factory.CreateAuthenticatedClientAsync();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        await db.Users.Where(row => row.Id == author.Id).ExecuteUpdateAsync(update => update.SetProperty(row => row.IsActive, false));
        var comment = Assert.Single((await reader.GetFromJsonAsync<CommentResponse[]>(Route(item.Id)))!);
        Assert.Equal(author.Id, comment.Author.Id);
        Assert.Equal("Visible author", comment.Author.DisplayName);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" \n\t ")]
    [InlineData(null)]
    public async Task BlankOrNullBody_ReturnsValidationProblem_AndPersistsNeither(string? body)
    {
        await factory.ResetDatabaseAsync();
        using var client = await factory.CreateAuthenticatedClientAsync();
        var item = await CreateItemAsync(client);
        using var response = await client.PostAsJsonAsync(Route(item.Id), new { body });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertProblemAsync(response, 400);
        await AssertNoCommentWritesAsync(item.Id);
    }

    [Fact]
    public async Task MissingBody_ReturnsValidationProblem_AndPersistsNeither()
    {
        await factory.ResetDatabaseAsync();
        using var client = await factory.CreateAuthenticatedClientAsync();
        var item = await CreateItemAsync(client);
        using var response = await client.PostAsJsonAsync(Route(item.Id), new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertProblemAsync(response, 400);
        await AssertNoCommentWritesAsync(item.Id);
    }

    [Fact]
    public async Task BodyLengthLimit_IsAuthoritative_AndAcceptsExactly2000()
    {
        await factory.ResetDatabaseAsync();
        using var client = await factory.CreateAuthenticatedClientAsync();
        var item = await CreateItemAsync(client);
        using var invalid = await client.PostAsJsonAsync(Route(item.Id), new { body = new string('x', 2001) });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        await AssertProblemAsync(invalid, 400);
        await AssertNoCommentWritesAsync(item.Id);
        using var valid = await client.PostAsJsonAsync(Route(item.Id), new { body = new string('x', 2000) });
        Assert.Equal(HttpStatusCode.Created, valid.StatusCode);
        Assert.Equal(2000, (await valid.Content.ReadFromJsonAsync<CommentResponse>())!.Body.Length);
    }

    [Theory]
    [InlineData("authorUserId")]
    [InlineData("author")]
    [InlineData("createdAtUtc")]
    [InlineData("role")]
    [InlineData("workItemId")]
    [InlineData("expectedVersion")]
    public async Task StrictBodyOnlyRequest_RejectsSpoofedIdentityAndVersionFields(string field)
    {
        await factory.ResetDatabaseAsync();
        using var client = await factory.CreateAuthenticatedClientAsync();
        var item = await CreateItemAsync(client);
        var payload = new Dictionary<string, object?> { ["body"] = "Spoof attempt", [field] = "attacker-controlled-value" };
        using var response = await client.PostAsJsonAsync(Route(item.Id), payload);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertProblemAsync(response, 400);
        await AssertNoCommentWritesAsync(item.Id);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MissingWorkItem_GetAndPost_ReturnNotFound(bool post)
    {
        using var client = await factory.CreateAuthenticatedClientAsync();
        using var response = post
            ? await client.PostAsJsonAsync(Route(Guid.NewGuid()), new { body = "Missing work item" })
            : await client.GetAsync(Route(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertProblemAsync(response, 404);
    }

    [Fact]
    public async Task GetComments_OrdersByTimestampThenIdAscending()
    {
        await factory.ResetDatabaseAsync();
        var author = await factory.SeedUserAsync();
        using var client = await factory.CreateAuthenticatedClientAsync(author);
        var item = await CreateItemAsync(client);
        var firstId = Guid.Parse("00000000-0000-0000-0000-000000000003");
        var tieFirstId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var tieLastId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var timestamp = new DateTime(2026, 9, 30, 10, 0, 0, DateTimeKind.Utc);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        foreach (var (id, created) in new[] { (tieLastId, timestamp), (firstId, timestamp.AddDays(-1)), (tieFirstId, timestamp) })
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "Comments" ("Id", "WorkItemId", "AuthorUserId", "Body", "CreatedAtUtc")
                VALUES ({id}, {item.Id}, {author.Id}, {"Ordered comment"}, {created})
                """);
        var comments = (await client.GetFromJsonAsync<CommentResponse[]>(Route(item.Id)))!;
        Assert.Equal(new[] { firstId, tieFirstId, tieLastId }, comments.Select(comment => comment.Id));
    }

    [Theory]
    [InlineData("Comments")]
    [InlineData("ActivityEvents")]
    public async Task DatabaseWriteFailure_RollsBackCommentAndActivityTogether(string failingTable)
    {
        await factory.ResetDatabaseAsync();
        using var client = await factory.CreateAuthenticatedClientAsync();
        var item = await CreateItemAsync(client);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_comment_write() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Injected comment transaction failure'; END; $$
            """);
        var triggerSql = failingTable == "ActivityEvents"
            ? "CREATE TRIGGER reject_comment_write AFTER INSERT ON \"ActivityEvents\" FOR EACH ROW WHEN (NEW.\"EventType\" = 'CommentAdded') EXECUTE FUNCTION reject_comment_write()"
            : "CREATE TRIGGER reject_comment_write AFTER INSERT ON \"Comments\" FOR EACH ROW EXECUTE FUNCTION reject_comment_write()";
        await db.Database.ExecuteSqlRawAsync(triggerSql);
        try
        {
            using var response = await client.PostAsJsonAsync(Route(item.Id), new { body = "Must not be partially saved" });
            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
            await AssertProblemAsync(response, 500);
            await AssertNoCommentWritesAsync(item.Id);
            var unchanged = await db.WorkItems.AsNoTracking().SingleAsync(row => row.Id == item.Id);
            Assert.Equal(item.Version, unchanged.Version);
            Assert.Equal(item.UpdatedAtUtc, unchanged.UpdatedAtUtc);
        }
        finally
        {
            var dropTriggerSql = failingTable == "ActivityEvents"
                ? "DROP TRIGGER IF EXISTS reject_comment_write ON \"ActivityEvents\""
                : "DROP TRIGGER IF EXISTS reject_comment_write ON \"Comments\"";
            await db.Database.ExecuteSqlRawAsync(dropTriggerSql);
            await db.Database.ExecuteSqlRawAsync("DROP FUNCTION IF EXISTS reject_comment_write()");
        }
        using var retry = await client.PostAsJsonAsync(Route(item.Id), new { body = "Successful later operation" });
        Assert.Equal(HttpStatusCode.Created, retry.StatusCode);
        Assert.Single(await db.Comments.AsNoTracking().ToListAsync());
        Assert.Single(await db.ActivityEvents.AsNoTracking().Where(row => row.EventType == ActivityEventType.CommentAdded).ToListAsync());
    }

    [Fact]
    public async Task OtherUserComment_DoesNotInvalidateAnOpenEditVersion()
    {
        await factory.ResetDatabaseAsync();
        using var creator = await factory.CreateAuthenticatedClientAsync();
        using var other = await factory.CreateAuthenticatedClientAsync();
        var item = await CreateItemAsync(creator);
        var editSnapshot = (await creator.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{item.Id}"))!;
        using var comment = await other.PostAsJsonAsync(Route(item.Id), new { body = "An unrelated Member can contribute" });
        Assert.Equal(HttpStatusCode.Created, comment.StatusCode);
        var afterComment = (await creator.GetFromJsonAsync<WorkItemResponse>($"/api/v1/work-items/{item.Id}"))!;
        Assert.Equal(editSnapshot.Version, afterComment.Version);
        Assert.Equal(editSnapshot.UpdatedAtUtc, afterComment.UpdatedAtUtc);
        using var edit = await creator.PatchAsJsonAsync($"/api/v1/work-items/{item.Id}", new
        {
            title = "Original edit still valid",
            description = editSnapshot.Description,
            priority = editSnapshot.Priority,
            categoryId = editSnapshot.CategoryId,
            expectedVersion = editSnapshot.Version
        });
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var updated = (await edit.Content.ReadFromJsonAsync<WorkItemResponse>())!;
        Assert.Equal(editSnapshot.Version + 1, updated.Version);
        Assert.Equal("Original edit still valid", updated.Title);
        Assert.Single((await creator.GetFromJsonAsync<CommentResponse[]>(Route(item.Id)))!);
    }

    private static string Route(Guid itemId) => $"/api/v1/work-items/{itemId}/comments";

    private static async Task<WorkItemResponse> CreateItemAsync(HttpClient client)
    {
        using var response = await client.PostAsJsonAsync("/api/v1/work-items", new
        {
            title = "Comment test item",
            priority = "Medium",
            assigneeUserId = (Guid?)null
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<WorkItemResponse>())!;
    }

    private async Task AssertNoCommentWritesAsync(Guid itemId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        Assert.Empty(await db.Comments.AsNoTracking().Where(row => row.WorkItemId == itemId).ToListAsync());
        Assert.DoesNotContain(await db.ActivityEvents.AsNoTracking().Where(row => row.WorkItemId == itemId).ToListAsync(), row => row.EventType.ToString() == "CommentAdded");
    }

    private static async Task AssertProblemAsync(HttpResponseMessage response, int status)
    {
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(status, problem.GetProperty("status").GetInt32());
        Assert.True(problem.TryGetProperty("title", out _));
        Assert.False(problem.TryGetProperty("exception", out _));
        if (status == 500)
            Assert.DoesNotContain("Injected", problem.GetRawText());
    }
}
