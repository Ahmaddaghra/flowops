using System.Text.Json;
using FlowOps.Application.Authorization;
using FlowOps.Application.DTOs;
using FlowOps.Application.Exceptions;
using FlowOps.Application.Interfaces;
using FlowOps.Application.Services;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace FlowOps.UnitTests.Application;

public class WorkItemCommentServiceTests
{
    private static readonly Guid AuthorId = Guid.Parse("30000000-0000-0000-0000-000000000020");
    private readonly Mock<IWorkItemStore> _store = new();
    private readonly Mock<IUserDirectory> _users = new();

    private WorkItemService Service(Guid? userId = null, bool anonymous = false) =>
        new(_store.Object, NullLogger<WorkItemService>.Instance,
            new TestCurrentUser(anonymous ? null : userId ?? AuthorId, AppRoles.Member), _users.Object);

    public WorkItemCommentServiceTests()
    {
        _users.Setup(users => users.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, UserSummaryResponse>
            {
                [AuthorId] = new(AuthorId, "Authenticated member")
            });
    }

    [Fact]
    public async Task AddComment_UsesCurrentUserAndOneSaveWithoutMutatingLegacyWorkItem()
    {
        var item = new WorkItem("Legacy work item", assigneeName: "Historical display name");
        var beforeVersion = item.Version;
        var beforeTimestamp = item.UpdatedAtUtc;
        Comment? savedComment = null;
        ActivityEvent? savedActivity = null;
        _store.Setup(store => store.GetByIdAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        _store.Setup(store => store.AddCommentAsync(It.IsAny<Comment>(), It.IsAny<CancellationToken>()))
            .Callback<Comment, CancellationToken>((comment, _) => savedComment = comment).Returns(Task.CompletedTask);
        _store.Setup(store => store.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()))
            .Callback<ActivityEvent, CancellationToken>((activity, _) => savedActivity = activity).Returns(Task.CompletedTask);

        var response = await Service().AddCommentAsync(item.Id, new CreateCommentRequest { Body = "  Investigation notes  " });

        Assert.NotNull(response);
        Assert.NotNull(savedComment);
        Assert.NotNull(savedActivity);
        Assert.Equal(AuthorId, savedComment.AuthorUserId);
        Assert.Equal(AuthorId, response.Author.Id);
        Assert.Equal("Authenticated member", response.Author.DisplayName);
        Assert.Equal(item.Id, response.WorkItemId);
        Assert.Equal(savedComment.Id, response.Id);
        Assert.Equal("Investigation notes", response.Body);
        Assert.Equal(item.Id, savedActivity.WorkItemId);
        Assert.Equal(AuthorId, savedActivity.ActorUserId);
        Assert.Equal(ActivityEventType.CommentAdded, savedActivity.EventType);
        Assert.Equal("Comment added", savedActivity.Description);
        Assert.DoesNotContain(response.Body, savedActivity.Description);
        Assert.Equal(savedComment.CreatedAtUtc, savedActivity.CreatedAtUtc);
        Assert.Equal(beforeVersion, item.Version);
        Assert.Equal(beforeTimestamp, item.UpdatedAtUtc);
        _store.Verify(store => store.GetByIdForUpdateAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.AddCommentAsync(It.IsAny<Comment>(), It.IsAny<CancellationToken>()), Times.Once);
        _store.Verify(store => store.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()), Times.Once);
        _store.Verify(store => store.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetComments_BatchesDistinctAuthorsPreservesOrderAndUsesSafeFallback()
    {
        var item = new WorkItem("Work item");
        var unavailableAuthor = Guid.NewGuid();
        var comments = new[]
        {
            new Comment(item.Id, AuthorId, "First", DateTime.UtcNow.AddHours(-2)),
            new Comment(item.Id, unavailableAuthor, "Second", DateTime.UtcNow.AddHours(-1)),
            new Comment(item.Id, AuthorId, "Third")
        };
        Guid[]? requestedAuthors = null;
        _store.Setup(store => store.GetByIdAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        _store.Setup(store => store.GetCommentsAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(comments);
        _users.Setup(users => users.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
            .Callback<IEnumerable<Guid>, CancellationToken>((ids, _) => requestedAuthors = ids.ToArray())
            .ReturnsAsync(new Dictionary<Guid, UserSummaryResponse> { [AuthorId] = new(AuthorId, "Member") });

        var response = await Service().GetCommentsAsync(item.Id);

        Assert.NotNull(response);
        Assert.Equal(new[] { "First", "Second", "Third" }, response.Select(comment => comment.Body));
        Assert.Equal(new[] { AuthorId, unavailableAuthor }, requestedAuthors);
        Assert.Equal(new UserSummaryResponse(unavailableAuthor, "User unavailable"), response[1].Author);
        _users.Verify(users => users.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AddComment_UsesSafeFallbackForUnavailableAuthorSummary()
    {
        var item = new WorkItem("Item");
        _store.Setup(store => store.GetByIdAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        _users.Setup(users => users.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, UserSummaryResponse>());

        var response = await Service().AddCommentAsync(item.Id, new CreateCommentRequest { Body = "Comment" });

        Assert.NotNull(response);
        Assert.Equal(new UserSummaryResponse(AuthorId, "User unavailable"), response.Author);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MissingWorkItem_ReturnsNullWithoutAddingOrSaving(bool add)
    {
        var id = Guid.NewGuid();

        object? response = add
            ? await Service().AddCommentAsync(id, new CreateCommentRequest { Body = "Comment" })
            : await Service().GetCommentsAsync(id);

        Assert.Null(response);
        _store.Verify(store => store.GetCommentsAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.AddCommentAsync(It.IsAny<Comment>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task AnonymousCall_RequiresAuthenticationBeforeResourceLookup(bool add)
    {
        var id = Guid.NewGuid();
        var service = Service(anonymous: true);

        await Assert.ThrowsAsync<AuthenticationRequiredException>(async () =>
        {
            if (add) await service.AddCommentAsync(id, new CreateCommentRequest { Body = "Comment" });
            else await service.GetCommentsAsync(id);
        });

        _store.Verify(store => store.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" \n\t ")]
    public async Task InvalidBody_DoesNotStageCommentActivityOrSave(string body)
    {
        var item = new WorkItem("Item");
        _store.Setup(store => store.GetByIdAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);

        await Assert.ThrowsAsync<ArgumentException>(() => Service().AddCommentAsync(item.Id, new CreateCommentRequest { Body = body }));

        _store.Verify(store => store.AddCommentAsync(It.IsAny<Comment>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SaveFailure_IsPropagatedThroughSingleSavePath()
    {
        var item = new WorkItem("Item");
        _store.Setup(store => store.GetByIdAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        _store.Setup(store => store.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Simulated save failure"));

        await Assert.ThrowsAsync<InvalidOperationException>(() => Service().AddCommentAsync(item.Id,
            new CreateCommentRequest { Body = "Comment" }));

        _store.Verify(store => store.AddCommentAsync(It.IsAny<Comment>(), It.IsAny<CancellationToken>()), Times.Once);
        _store.Verify(store => store.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()), Times.Once);
        _store.Verify(store => store.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AuthorResolutionFailure_HappensBeforeStagingOrSaving()
    {
        var item = new WorkItem("Item");
        _store.Setup(store => store.GetByIdAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        _users.Setup(users => users.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Simulated lookup failure"));

        await Assert.ThrowsAsync<InvalidOperationException>(() => Service().AddCommentAsync(item.Id,
            new CreateCommentRequest { Body = "Comment" }));

        _store.Verify(store => store.AddCommentAsync(It.IsAny<Comment>(), It.IsAny<CancellationToken>()), Times.Never);
        _store.Verify(store => store.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("authorUserId")]
    [InlineData("author")]
    [InlineData("createdAtUtc")]
    [InlineData("role")]
    [InlineData("workItemId")]
    [InlineData("expectedVersion")]
    public void StrictRequest_RejectsIdentityTimestampRouteAndVersionFields(string field)
    {
        var payload = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["body"] = "Comment",
            [field] = "spoofed value"
        });

        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<CreateCommentRequest>(payload, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }));
    }
}
