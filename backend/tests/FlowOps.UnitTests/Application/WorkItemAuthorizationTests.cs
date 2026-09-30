using FlowOps.Application.Authorization;
using FlowOps.Application.DTOs;
using FlowOps.Application.Exceptions;
using FlowOps.Application.Interfaces;
using FlowOps.Application.Services;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FlowOps.UnitTests.Application;

public class WorkItemAuthorizationTests
{
    private static readonly Guid CurrentId = Guid.Parse("30000000-0000-0000-0000-000000000001");
    private static readonly Guid OtherId = Guid.Parse("30000000-0000-0000-0000-000000000002");

    [Theory]
    [InlineData("Admin", "unrelated", true)]
    [InlineData("Member", "creator", true)]
    [InlineData("Member", "assignee", true)]
    [InlineData("Member", "unrelated", false)]
    [InlineData("Member", "legacy", false)]
    public void Permissions_EditAndStatusFollowIdentity(string role, string relation, bool allowed)
    {
        var item = Item(relation);
        var permissions = new WorkItemAuthorization(new TestCurrentUser(CurrentId, role)).GetPermissions(item);
        Assert.Equal(allowed, permissions.CanEdit);
        Assert.Equal(allowed, permissions.CanChangeStatus);
    }

    [Theory]
    [InlineData("Member", "none", "self", true)]
    [InlineData("Member", "none", "other", false)]
    [InlineData("Member", "other", "self", false)]
    [InlineData("Member", "other", "none", false)]
    [InlineData("Member", "self", "none", true)]
    [InlineData("Member", "self", "other", false)]
    [InlineData("Member", "self", "self", false)]
    [InlineData("Admin", "none", "other", true)]
    [InlineData("Admin", "other", "self", true)]
    [InlineData("Admin", "other", "none", true)]
    public void Assignment_ExactRoleRules(string role, string previous, string next, bool allowed)
    {
        var item = new WorkItem("Item", createdByUserId: OtherId, assigneeUserId: Id(previous));
        var authorization = new WorkItemAuthorization(new TestCurrentUser(CurrentId, role));
        if (allowed) authorization.RequireAssignment(item, Id(next));
        else Assert.Throws<ForbiddenOperationException>(() => authorization.RequireAssignment(item, Id(next)));
    }

    [Theory]
    [InlineData("edit")]
    [InlineData("status")]
    [InlineData("assign")]
    public async Task Forbidden_StopsBeforeVersionMutationActivityOrSave(string operation)
    {
        // Deliberately stale: denial must win over a concurrency conflict.
        var item = new WorkItem("Original", description: "Original description", createdByUserId: OtherId, assigneeUserId: OtherId);
        item.ChangeTitle("Winning title");
        var version = item.Version;
        var updatedAt = item.UpdatedAtUtc;
        var store = new Mock<IWorkItemStore>();
        store.Setup(x => x.GetByIdForUpdateAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        var users = Directory();
        var service = new WorkItemService(store.Object, NullLogger<WorkItemService>.Instance,
            new TestCurrentUser(CurrentId, AppRoles.Member), users.Object);

        await Assert.ThrowsAsync<ForbiddenOperationException>(() => operation switch
        {
            "edit" => service.UpdateAsync(item.Id, new UpdateWorkItemRequest { Title = "Attacker", Priority = "Critical", ExpectedVersion = 1 }),
            "status" => service.ChangeStatusAsync(item.Id, new ChangeWorkItemStatusRequest { Status = "InProgress", ExpectedVersion = 1 }),
            _ => service.AssignAsync(item.Id, new AssignWorkItemRequest { AssigneeUserId = CurrentId, ExpectedVersion = 1 })
        });

        Assert.Equal("Winning title", item.Title);
        Assert.Equal("Original description", item.Description);
        Assert.Equal(WorkItemStatus.Todo, item.Status);
        Assert.Equal(WorkItemPriority.Medium, item.Priority);
        Assert.Equal(OtherId, item.AssigneeUserId);
        Assert.Equal(version, item.Version);
        Assert.Equal(updatedAt, item.UpdatedAtUtc);
        store.Verify(x => x.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()), Times.Never);
        store.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        users.Verify(x => x.ExistsActiveAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData("Admin", "unrelated", "edit")]
    [InlineData("Admin", "unrelated", "status")]
    [InlineData("Member", "creator", "edit")]
    [InlineData("Member", "creator", "status")]
    [InlineData("Member", "assignee", "edit")]
    [InlineData("Member", "assignee", "status")]
    public async Task Allowed_MutationsRecordAuthenticatedActor(string role, string relation, string operation)
    {
        var item = Item(relation);
        var store = new Mock<IWorkItemStore>();
        store.Setup(x => x.GetByIdForUpdateAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        var service = new WorkItemService(store.Object, NullLogger<WorkItemService>.Instance,
            new TestCurrentUser(CurrentId, role), Directory().Object);
        var result = operation == "edit"
            ? await service.UpdateAsync(item.Id, new UpdateWorkItemRequest { Title = "Changed", Priority = "Medium", ExpectedVersion = 1 })
            : await service.ChangeStatusAsync(item.Id, new ChangeWorkItemStatusRequest { Status = "InProgress", ExpectedVersion = 1 });
        Assert.Equal(2, result?.Version);
        store.Verify(x => x.AddActivityEventAsync(It.Is<ActivityEvent>(e => e.ActorUserId == CurrentId), It.IsAny<CancellationToken>()), Times.Once);
        store.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Create_CannotAssignAnotherUserBeforeAnyWrite()
    {
        var store = new Mock<IWorkItemStore>();
        var service = new WorkItemService(store.Object, NullLogger<WorkItemService>.Instance,
            new TestCurrentUser(CurrentId, AppRoles.Member), Directory().Object);
        await Assert.ThrowsAsync<ForbiddenOperationException>(() => service.CreateAsync(new CreateWorkItemRequest
        {
            Title = "Item",
            AssigneeUserId = OtherId
        }));
        store.Verify(x => x.AddAsync(It.IsAny<WorkItem>(), It.IsAny<CancellationToken>()), Times.Never);
        store.Verify(x => x.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()), Times.Never);
        store.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public void LegacyName_DoesNotGrantPermission_AndSurvivesUserAssignment()
    {
        var item = new WorkItem("Legacy", assigneeName: "Current user");
        var auth = new WorkItemAuthorization(new TestCurrentUser(CurrentId, AppRoles.Member));
        Assert.Throws<ForbiddenOperationException>(() => auth.RequireEdit(item));
        Assert.Throws<ForbiddenOperationException>(() => auth.RequireAssignment(item, CurrentId));
        var admin = new WorkItemAuthorization(new TestCurrentUser(OtherId, AppRoles.Admin));
        admin.RequireAssignment(item, CurrentId);
        Assert.True(item.AssignToUser(CurrentId));
        auth.RequireEdit(item);
        Assert.Equal("Current user", item.AssigneeName);
        auth.RequireAssignment(item, null);
        item.AssignToUser(null);
        Assert.Throws<ForbiddenOperationException>(() => auth.RequireEdit(item));
        Assert.Throws<ForbiddenOperationException>(() => auth.RequireAssignment(item, CurrentId));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(99)]
    public async Task Legacy_MemberSelfAssignmentIsForbiddenBeforeVersionValidationAndWrites(long expectedVersion)
    {
        var item = new WorkItem("Legacy", assigneeName: "Current user");
        var updatedAt = item.UpdatedAtUtc;
        var store = new Mock<IWorkItemStore>();
        store.Setup(x => x.GetByIdForUpdateAsync(item.Id, It.IsAny<CancellationToken>())).ReturnsAsync(item);
        var users = Directory();
        var currentUser = new TestCurrentUser(CurrentId, AppRoles.Member);
        var service = new WorkItemService(store.Object, NullLogger<WorkItemService>.Instance, currentUser, users.Object);
        var permissions = new WorkItemAuthorization(currentUser).GetPermissions(item);

        Assert.False(permissions.CanEdit);
        Assert.False(permissions.CanChangeStatus);
        Assert.False(permissions.CanAssign);
        Assert.False(permissions.CanSelfAssign);
        Assert.False(permissions.CanUnassign);
        Assert.False(permissions.CanAssignOthers);
        await Assert.ThrowsAsync<ForbiddenOperationException>(() => service.AssignAsync(item.Id,
            new AssignWorkItemRequest { AssigneeUserId = CurrentId, ExpectedVersion = expectedVersion }));

        Assert.Null(item.CreatedByUserId);
        Assert.Null(item.AssigneeUserId);
        Assert.Equal("Current user", item.AssigneeName);
        Assert.Equal(1, item.Version);
        Assert.Equal(updatedAt, item.UpdatedAtUtc);
        store.Verify(x => x.AddActivityEventAsync(It.IsAny<ActivityEvent>(), It.IsAny<CancellationToken>()), Times.Never);
        store.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        users.Verify(x => x.ExistsActiveAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public void Anonymous_AndUnsupportedRoleHaveDifferentErrors()
    {
        Assert.Throws<AuthenticationRequiredException>(() => new WorkItemAuthorization(new TestCurrentUser(null)).RequireUser());
        Assert.Throws<ForbiddenOperationException>(() => new WorkItemAuthorization(new TestCurrentUser(CurrentId, "Unsupported")).RequireUser());
    }

    [Fact]
    public void UserAssignment_PreservesConcurrencyAndNoopVersion()
    {
        var item = new WorkItem("Item");
        Assert.True(item.AssignToUser(CurrentId));
        Assert.Equal(2, item.Version);
        Assert.False(item.AssignToUser(CurrentId));
        Assert.Equal(2, item.Version);
        Assert.True(item.AssignToUser(null));
        Assert.Equal(3, item.Version);
        Assert.Throws<ArgumentException>(() => item.AssignToUser(Guid.Empty));
    }

    private static Guid? Id(string value) => value switch { "self" => CurrentId, "other" => OtherId, _ => null };
    private static WorkItem Item(string relation) => new("Item",
        createdByUserId: relation == "creator" ? CurrentId : relation == "legacy" ? null : OtherId,
        assigneeUserId: relation == "assignee" ? CurrentId : null);
    private static Mock<IUserDirectory> Directory()
    {
        var users = new Mock<IUserDirectory>();
        users.Setup(x => x.GetByIdsAsync(It.IsAny<IEnumerable<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, UserSummaryResponse>
            {
                [CurrentId] = new(CurrentId, "Current user"),
                [OtherId] = new(OtherId, "Other user")
            });
        users.Setup(x => x.ExistsActiveAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        return users;
    }
}

internal sealed class TestCurrentUser(Guid? userId, string role = AppRoles.Admin) : ICurrentUser
{
    public Guid? UserId => userId;
    public string? DisplayName => "Current user";
    public IReadOnlyList<string> Roles => [role];
    public bool IsAuthenticated => userId is not null;
}
