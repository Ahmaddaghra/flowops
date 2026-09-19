using System;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Xunit;

namespace FlowOps.UnitTests.Domain;

public class WorkItemTests
{
    [Fact]
    public void Constructor_WithValidTitle_InitializesWorkItemCorrectly()
    {
        // Arrange & Act
        var item = new WorkItem(
            title: "Fix authentication bug",
            description: "Detailed description",
            priority: WorkItemPriority.High,
            assigneeName: "  Ahmad Daghra  "
        );

        // Assert
        Assert.NotEqual(Guid.Empty, item.Id);
        Assert.Equal("Fix authentication bug", item.Title);
        Assert.Equal("Detailed description", item.Description);
        Assert.Equal(WorkItemStatus.Todo, item.Status);
        Assert.Equal(WorkItemPriority.High, item.Priority);
        Assert.Equal("Ahmad Daghra", item.AssigneeName);
        Assert.Equal(DateTimeKind.Utc, item.CreatedAtUtc.Kind);
        Assert.Equal(DateTimeKind.Utc, item.UpdatedAtUtc.Kind);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_WithNullOrEmptyTitle_ThrowsArgumentException(string? invalidTitle)
    {
        // Act & Assert
        var ex = Assert.Throws<ArgumentException>(() => new WorkItem(title: invalidTitle!));
        Assert.Contains("Title is required", ex.Message);
    }

    [Fact]
    public void Constructor_WithTitleExceedingMaxLength_ThrowsArgumentException()
    {
        // Arrange
        var longTitle = new string('A', WorkItem.MaxTitleLength + 1);

        // Act & Assert
        var ex = Assert.Throws<ArgumentException>(() => new WorkItem(title: longTitle));
        Assert.Contains($"cannot exceed {WorkItem.MaxTitleLength}", ex.Message);
    }

    [Fact]
    public void Constructor_WithDescriptionExceedingMaxLength_ThrowsArgumentException()
    {
        // Arrange
        var longDesc = new string('D', WorkItem.MaxDescriptionLength + 1);

        // Act & Assert
        var ex = Assert.Throws<ArgumentException>(() => new WorkItem(title: "Valid Title", description: longDesc));
        Assert.Contains($"cannot exceed {WorkItem.MaxDescriptionLength}", ex.Message);
    }

    [Fact]
    public void Constructor_WithAssigneeNameExceedingMaxLength_ThrowsArgumentException()
    {
        // Arrange
        var longAssignee = new string('U', WorkItem.MaxAssigneeNameLength + 1);

        // Act & Assert
        var ex = Assert.Throws<ArgumentException>(() => new WorkItem(title: "Valid Title", assigneeName: longAssignee));
        Assert.Contains($"cannot exceed {WorkItem.MaxAssigneeNameLength}", ex.Message);
    }

    [Fact]
    public void SetStatus_WithValidStatus_UpdatesStatusAndTimestamp()
    {
        // Arrange
        var item = new WorkItem(title: "Initial Title");
        var initialUpdatedAt = item.UpdatedAtUtc;

        // Act
        item.SetStatus(WorkItemStatus.InProgress);

        // Assert
        Assert.Equal(WorkItemStatus.InProgress, item.Status);
        Assert.True(item.UpdatedAtUtc >= initialUpdatedAt);
    }

    [Fact]
    public void SetStatus_WithInvalidEnum_ThrowsArgumentException()
    {
        // Arrange
        var item = new WorkItem(title: "Initial Title");

        // Act & Assert
        Assert.Throws<ArgumentException>(() => item.SetStatus((WorkItemStatus)999));
    }

    [Fact]
    public void SetPriority_WithInvalidEnum_ThrowsArgumentException()
    {
        // Arrange
        var item = new WorkItem(title: "Initial Title");

        // Act & Assert
        Assert.Throws<ArgumentException>(() => item.SetPriority((WorkItemPriority)999));
    }
}
