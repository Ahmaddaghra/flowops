using System;
using System.Threading.Tasks;
using FlowOps.Application.DTOs;
using FlowOps.Application.Services;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using FlowOps.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace FlowOps.UnitTests.Application;

public class WorkItemServiceTests
{
    private static FlowOpsDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<FlowOpsDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        return new FlowOpsDbContext(options);
    }

    [Fact]
    public async Task CreateAsync_WithValidRequest_SavesToDatabaseAndReturnsResponse()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = new WorkItemService(context, NullLogger<WorkItemService>.Instance);

        var request = new CreateWorkItemRequest
        {
            Title = "Implement login page",
            Description = "User authentication workflow",
            Priority = "High",
            AssigneeName = "Ahmad Daghra"
        };

        // Act
        var result = await service.CreateAsync(request);

        // Assert
        Assert.NotNull(result);
        Assert.NotEqual(Guid.Empty, result.Id);
        Assert.Equal("Implement login page", result.Title);
        Assert.Equal("User authentication workflow", result.Description);
        Assert.Equal(nameof(WorkItemStatus.Todo), result.Status);
        Assert.Equal(nameof(WorkItemPriority.High), result.Priority);
        Assert.Equal("Ahmad Daghra", result.AssigneeName);

        var entityInDb = await context.WorkItems.FindAsync(result.Id);
        Assert.NotNull(entityInDb);
        Assert.Equal("Implement login page", entityInDb.Title);
    }

    [Fact]
    public async Task CreateAsync_WithInvalidPriorityString_ThrowsArgumentException()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = new WorkItemService(context, NullLogger<WorkItemService>.Instance);

        var request = new CreateWorkItemRequest
        {
            Title = "Test Item",
            Priority = "SuperUrgent"
        };

        // Act & Assert
        var ex = await Assert.ThrowsAsync<ArgumentException>(() => service.CreateAsync(request));
        Assert.Contains("Invalid priority value", ex.Message);
    }

    [Fact]
    public async Task GetAllAsync_ReturnsAllWorkItemsOrderedByCreatedAtDescending()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = new WorkItemService(context, NullLogger<WorkItemService>.Instance);

        var item1 = new WorkItem("First Item", createdAtUtc: DateTime.UtcNow.AddHours(-2));
        var item2 = new WorkItem("Second Item", createdAtUtc: DateTime.UtcNow);

        context.WorkItems.AddRange(item1, item2);
        await context.SaveChangesAsync();

        // Act
        var results = await service.GetAllAsync();

        // Assert
        Assert.Equal(2, results.Count);
        Assert.Equal("Second Item", results[0].Title);
        Assert.Equal("First Item", results[1].Title);
    }

    [Fact]
    public async Task GetByIdAsync_WhenItemExists_ReturnsResponse()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = new WorkItemService(context, NullLogger<WorkItemService>.Instance);

        var item = new WorkItem("Existing Item");
        context.WorkItems.Add(item);
        await context.SaveChangesAsync();

        // Act
        var result = await service.GetByIdAsync(item.Id);

        // Assert
        Assert.NotNull(result);
        Assert.Equal(item.Id, result.Id);
        Assert.Equal("Existing Item", result.Title);
    }

    [Fact]
    public async Task GetByIdAsync_WhenItemDoesNotExist_ReturnsNull()
    {
        // Arrange
        using var context = CreateInMemoryDbContext();
        var service = new WorkItemService(context, NullLogger<WorkItemService>.Instance);

        // Act
        var result = await service.GetByIdAsync(Guid.NewGuid());

        // Assert
        Assert.Null(result);
    }
}
