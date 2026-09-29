using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using FlowOps.Domain.Exceptions;

namespace FlowOps.UnitTests.Domain;

public class WorkItemTests
{
    [Fact]
    public void Constructor_NormalizesTitleAndStartsTodo()
    {
        var item = new WorkItem("  Repair login  ", createdAtUtc: DateTime.UnixEpoch);

        Assert.Equal("Repair login", item.Title);
        Assert.Equal(WorkItemStatus.Todo, item.Status);
        Assert.Equal(1, item.Version);
        Assert.Equal(DateTimeKind.Utc, item.CreatedAtUtc.Kind);
        Assert.Equal(item.CreatedAtUtc, item.UpdatedAtUtc);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_RejectsMissingTitle(string? title)
    {
        var exception = Assert.Throws<ArgumentException>(() => new WorkItem(title!));
        Assert.Contains("Title is required", exception.Message);
    }

    [Fact]
    public void Constructor_RejectsTitleOverLimit()
    {
        Assert.Throws<ArgumentException>(() => new WorkItem(new string('x', WorkItem.MaxTitleLength + 1)));
    }

    [Fact]
    public void Constructor_RejectsDescriptionOverLimit()
    {
        Assert.Throws<ArgumentException>(() => new WorkItem("Title", new string('x', WorkItem.MaxDescriptionLength + 1)));
    }

    [Fact]
    public void Constructor_RejectsAssigneeOverLimit()
    {
        Assert.Throws<ArgumentException>(() => new WorkItem("Title", assigneeName: new string('x', WorkItem.MaxAssigneeNameLength + 1)));
    }

    [Fact]
    public void ChangeTitle_TrimsAndUpdatesTimestamp()
    {
        var item = new WorkItem("Initial");
        var originalTime = item.UpdatedAtUtc;

        Assert.True(item.ChangeTitle("  Updated  "));

        Assert.Equal("Updated", item.Title);
        Assert.Equal(2, item.Version);
        Assert.True(item.UpdatedAtUtc > originalTime);
    }

    [Fact]
    public void ChangeDescription_UpdatesDescription()
    {
        var item = new WorkItem("Title");

        Assert.True(item.ChangeDescription("details"));

        Assert.Equal("details", item.Description);
    }

    [Fact]
    public void ChangePriority_RejectsUndefinedEnum()
    {
        var item = new WorkItem("Title");

        Assert.Throws<ArgumentException>(() => item.ChangePriority((WorkItemPriority)999));
    }

    [Fact]
    public void ChangeCategory_ChangesCategoryId()
    {
        var item = new WorkItem("Title");
        var categoryId = Guid.NewGuid();

        Assert.True(item.ChangeCategory(categoryId));

        Assert.Equal(categoryId, item.CategoryId);
    }

    [Fact]
    public void AssignAndUnassign_NormalizeEmptyAssignee()
    {
        var item = new WorkItem("Title");

        Assert.True(item.Assign(" Ahmad "));
        Assert.Equal("Ahmad", item.AssigneeName);
        Assert.True(item.Assign(" "));
        Assert.Null(item.AssigneeName);
    }

    [Fact]
    public void NoOpMutations_DoNotChangeTimestamp()
    {
        var item = new WorkItem("Title", description: "details", priority: WorkItemPriority.High, assigneeName: "Ahmad");
        var timestamp = item.UpdatedAtUtc;

        Assert.False(item.ChangeTitle(" Title "));
        Assert.False(item.ChangeDescription("details"));
        Assert.False(item.ChangePriority(WorkItemPriority.High));
        Assert.False(item.ChangeCategory(null));
        Assert.False(item.Assign("Ahmad"));

        Assert.Equal(timestamp, item.UpdatedAtUtc);
        Assert.Equal(1, item.Version);
    }

    [Fact]
    public void MeaningfulMutations_IncrementVersion()
    {
        var item = new WorkItem("Initial");

        Assert.True(item.ChangeTitle("Updated"));
        Assert.Equal(2, item.Version);
        Assert.True(item.ChangeDescription("Details"));
        Assert.Equal(3, item.Version);
        Assert.True(item.ChangePriority(WorkItemPriority.High));
        Assert.Equal(4, item.Version);
        Assert.True(item.ChangeCategory(Guid.NewGuid()));
        Assert.Equal(5, item.Version);
        Assert.True(item.Assign("Ahmad"));
        Assert.Equal(6, item.Version);
        Assert.True(item.ChangeStatus(WorkItemStatus.InProgress));
        Assert.Equal(7, item.Version);
    }

    [Theory]
    [InlineData(WorkItemStatus.Todo, WorkItemStatus.InProgress)]
    [InlineData(WorkItemStatus.Todo, WorkItemStatus.Blocked)]
    [InlineData(WorkItemStatus.InProgress, WorkItemStatus.Blocked)]
    [InlineData(WorkItemStatus.InProgress, WorkItemStatus.Done)]
    [InlineData(WorkItemStatus.Blocked, WorkItemStatus.InProgress)]
    [InlineData(WorkItemStatus.Blocked, WorkItemStatus.Todo)]
    public void ChangeStatus_AllowsDocumentedTransitions(WorkItemStatus current, WorkItemStatus next)
    {
        var item = new WorkItem("Title", status: current);

        Assert.True(item.ChangeStatus(next));
        Assert.Equal(next, item.Status);
    }

    [Theory]
    [InlineData(WorkItemStatus.Todo, WorkItemStatus.Done)]
    [InlineData(WorkItemStatus.InProgress, WorkItemStatus.Todo)]
    [InlineData(WorkItemStatus.Blocked, WorkItemStatus.Done)]
    [InlineData(WorkItemStatus.Done, WorkItemStatus.Todo)]
    [InlineData(WorkItemStatus.Done, WorkItemStatus.InProgress)]
    [InlineData(WorkItemStatus.Done, WorkItemStatus.Blocked)]
    public void ChangeStatus_RejectsUndocumentedTransitions(WorkItemStatus current, WorkItemStatus next)
    {
        var item = new WorkItem("Title", status: current);

        Assert.Throws<InvalidWorkItemTransitionException>(() => item.ChangeStatus(next));
    }

    [Theory]
    [InlineData(WorkItemStatus.Todo)]
    [InlineData(WorkItemStatus.InProgress)]
    [InlineData(WorkItemStatus.Blocked)]
    [InlineData(WorkItemStatus.Done)]
    public void ChangeStatus_RejectsSameStateTransition(WorkItemStatus status)
    {
        var item = new WorkItem("Title", status: status);

        var exception = Assert.Throws<InvalidWorkItemTransitionException>(() => item.ChangeStatus(status));

        Assert.Equal(status, exception.CurrentStatus);
        Assert.Equal(status, exception.RequestedStatus);
        Assert.Equal(1, item.Version);
    }

    [Fact]
    public void ChangeStatus_RejectsUndefinedEnum()
    {
        var item = new WorkItem("Title");

        Assert.Throws<ArgumentException>(() => item.ChangeStatus((WorkItemStatus)999));
    }

    [Fact]
    public void Category_NormalizesNameAndCaseInsensitiveKey()
    {
        var category = new Category(Guid.NewGuid(), "  oPerations ");

        Assert.Equal("oPerations", category.Name);
        Assert.Equal("OPERATIONS", category.NameKey);
    }
}
