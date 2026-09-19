using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using FlowOps.Application.Services;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace FlowOps.UnitTests.Application;

public class WorkItemServiceTests
{
    private readonly Mock<IWorkItemStore> _mockStore;
    private readonly WorkItemService _service;

    public WorkItemServiceTests()
    {
        _mockStore = new Mock<IWorkItemStore>();
        _service = new WorkItemService(_mockStore.Object, NullLogger<WorkItemService>.Instance);
    }

    [Fact]
    public async Task CreateAsync_WithValidRequest_SavesToStoreAndReturnsResponse()
    {
        // Arrange
        WorkItem? savedItem = null;
        _mockStore
            .Setup(x => x.AddAsync(It.IsAny<WorkItem>(), It.IsAny<CancellationToken>()))
            .Callback<WorkItem, CancellationToken>((item, _) => savedItem = item)
            .Returns(Task.CompletedTask);

        _mockStore
            .Setup(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var request = new CreateWorkItemRequest
        {
            Title = "Implement login page",
            Description = "User authentication workflow",
            Priority = "High",
            AssigneeName = "Ahmad Daghra"
        };

        // Act
        var result = await _service.CreateAsync(request);

        // Assert
        Assert.NotNull(result);
        Assert.NotEqual(Guid.Empty, result.Id);
        Assert.Equal("Implement login page", result.Title);
        Assert.Equal("User authentication workflow", result.Description);
        Assert.Equal(nameof(WorkItemStatus.Todo), result.Status);
        Assert.Equal(nameof(WorkItemPriority.High), result.Priority);
        Assert.Equal("Ahmad Daghra", result.AssigneeName);

        Assert.NotNull(savedItem);
        Assert.Equal("Implement login page", savedItem.Title);
        Assert.Equal(WorkItemPriority.High, savedItem.Priority);
        Assert.Equal("Ahmad Daghra", savedItem.AssigneeName);

        _mockStore.Verify(x => x.AddAsync(It.IsAny<WorkItem>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockStore.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateAsync_WithNullRequest_ThrowsArgumentNullException()
    {
        // Act & Assert
        await Assert.ThrowsAsync<ArgumentNullException>(() => _service.CreateAsync(null!));
    }

    [Fact]
    public async Task CreateAsync_WithInvalidPriorityString_ThrowsArgumentException()
    {
        // Arrange
        var request = new CreateWorkItemRequest
        {
            Title = "Test Item",
            Priority = "SuperUrgent"
        };

        // Act & Assert
        var ex = await Assert.ThrowsAsync<ArgumentException>(() => _service.CreateAsync(request));
        Assert.Contains("Invalid priority value", ex.Message);
        _mockStore.Verify(x => x.AddAsync(It.IsAny<WorkItem>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockStore.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetAllAsync_ReturnsAllWorkItemsOrderedByCreatedAtDescending()
    {
        // Arrange
        var item1 = new WorkItem("First Item", createdAtUtc: DateTime.UtcNow.AddHours(-2));
        var item2 = new WorkItem("Second Item", createdAtUtc: DateTime.UtcNow);

        _mockStore
            .Setup(x => x.ListAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<WorkItem> { item2, item1 });

        // Act
        var results = await _service.GetAllAsync();

        // Assert
        Assert.Equal(2, results.Count);
        Assert.Equal("Second Item", results[0].Title);
        Assert.Equal("First Item", results[1].Title);
        _mockStore.Verify(x => x.ListAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetByIdAsync_WhenItemExists_ReturnsResponse()
    {
        // Arrange
        var item = new WorkItem("Existing Item");
        _mockStore
            .Setup(x => x.GetByIdAsync(item.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(item);

        // Act
        var result = await _service.GetByIdAsync(item.Id);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(item.Id, result.Id);
        Assert.Equal("Existing Item", result.Title);
        _mockStore.Verify(x => x.GetByIdAsync(item.Id, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetByIdAsync_WhenItemDoesNotExist_ReturnsNull()
    {
        // Arrange
        var searchId = Guid.NewGuid();
        _mockStore
            .Setup(x => x.GetByIdAsync(searchId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((WorkItem?)null);

        // Act
        var result = await _service.GetByIdAsync(searchId);

        // Assert
        Assert.Null(result);
        _mockStore.Verify(x => x.GetByIdAsync(searchId, It.IsAny<CancellationToken>()), Times.Once);
    }
}
