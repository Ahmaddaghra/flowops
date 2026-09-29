using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Microsoft.Extensions.Logging;

namespace FlowOps.Application.Services;

public class WorkItemService : IWorkItemService
{
    private readonly IWorkItemStore _store;
    private readonly ILogger<WorkItemService> _logger;

    public WorkItemService(IWorkItemStore store, ILogger<WorkItemService> logger)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<IReadOnlyList<WorkItemResponse>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var items = await _store.ListAsync(cancellationToken);
        return items.Select(item => WorkItemResponse.FromEntity(item)).ToList();
    }

    public async Task<WorkItemResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var item = await _store.GetByIdAsync(id, cancellationToken);
        return item is null ? null : WorkItemResponse.FromEntity(item);
    }

    public async Task<WorkItemResponse> CreateAsync(CreateWorkItemRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var priority = ParsePriority(request.Priority, nameof(request.Priority));
        Category? category = null;
        if (request.CategoryId is Guid categoryId)
        {
            category = await GetActiveCategoryAsync(categoryId, cancellationToken);
        }

        var item = new WorkItem(
            title: request.Title,
            description: request.Description,
            priority: priority,
            assigneeName: request.AssigneeName,
            categoryId: request.CategoryId);

        await _store.AddAsync(item, cancellationToken);
        await _store.AddActivityEventAsync(
            new ActivityEvent(item.Id, ActivityEventType.Created, "Work item created", item.CreatedAtUtc),
            cancellationToken);
        await _store.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Created work item {WorkItemId}", item.Id);
        return WorkItemResponse.FromEntity(item, category?.Name);
    }

    public async Task<WorkItemResponse?> UpdateAsync(Guid id, UpdateWorkItemRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var item = await _store.GetByIdForUpdateAsync(id, cancellationToken);
        if (item is null) return null;

        var priority = ParsePriority(request.Priority, nameof(request.Priority));
        var previousCategoryName = item.Category?.Name;
        var categoryName = request.CategoryId == item.CategoryId ? previousCategoryName : null;
        if (request.CategoryId != item.CategoryId && request.CategoryId is Guid categoryId)
        {
            var category = await GetActiveCategoryAsync(categoryId, cancellationToken);
            categoryName = category.Name;
        }

        var changed = false;
        if (item.ChangeTitle(request.Title))
        {
            await AddActivityAsync(item.Id, ActivityEventType.TitleChanged, "Title changed", cancellationToken);
            changed = true;
        }
        if (item.ChangeDescription(request.Description))
        {
            await AddActivityAsync(item.Id, ActivityEventType.DescriptionChanged, "Description changed", cancellationToken);
            changed = true;
        }
        if (item.ChangePriority(priority))
        {
            await AddActivityAsync(item.Id, ActivityEventType.PriorityChanged, $"Priority changed to {priority}", cancellationToken);
            changed = true;
        }
        if (item.ChangeCategory(request.CategoryId))
        {
            var previousCategory = previousCategoryName ?? "Uncategorized";
            var nextCategory = categoryName ?? "Uncategorized";
            await AddActivityAsync(item.Id, ActivityEventType.CategoryChanged, $"Category changed from {previousCategory} to {nextCategory}", cancellationToken);
            changed = true;
        }

        if (changed) await _store.SaveChangesAsync(cancellationToken);

        return WorkItemResponse.FromEntity(item, categoryName);
    }

    public async Task<WorkItemResponse?> ChangeStatusAsync(Guid id, ChangeWorkItemStatusRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var item = await _store.GetByIdForUpdateAsync(id, cancellationToken);
        if (item is null) return null;

        var status = ParseStatus(request.Status, nameof(request.Status));
        var previous = item.Status;
        if (item.ChangeStatus(status))
        {
            await AddActivityAsync(item.Id, ActivityEventType.StatusChanged, $"Status changed from {previous} to {status}", cancellationToken);
            await _store.SaveChangesAsync(cancellationToken);
        }

        return WorkItemResponse.FromEntity(item);
    }

    public async Task<WorkItemResponse?> AssignAsync(Guid id, AssignWorkItemRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var item = await _store.GetByIdForUpdateAsync(id, cancellationToken);
        if (item is null) return null;

        var previous = item.AssigneeName;
        var next = string.IsNullOrWhiteSpace(request.AssigneeName) ? null : request.AssigneeName.Trim();
        if (item.Assign(request.AssigneeName))
        {
            var description = next is null
                ? "Work item unassigned"
                : previous is null ? $"Assigned to {next}" : $"Reassigned from {previous} to {next}";
            await AddActivityAsync(item.Id, ActivityEventType.AssignmentChanged, description, cancellationToken);
            await _store.SaveChangesAsync(cancellationToken);
        }

        return WorkItemResponse.FromEntity(item);
    }

    public async Task<IReadOnlyList<ActivityEventResponse>?> GetActivityAsync(Guid id, CancellationToken cancellationToken = default)
    {
        if (await _store.GetByIdAsync(id, cancellationToken) is null) return null;

        var events = await _store.GetActivityAsync(id, cancellationToken);
        return events.Select(activity => new ActivityEventResponse
        {
            Id = activity.Id,
            WorkItemId = activity.WorkItemId,
            EventType = activity.EventType.ToString(),
            Description = activity.Description,
            CreatedAtUtc = activity.CreatedAtUtc,
            ActorUserId = activity.ActorUserId
        }).ToList();
    }

    public async Task<IReadOnlyList<CategoryResponse>> GetCategoriesAsync(CancellationToken cancellationToken = default)
    {
        var categories = await _store.ListActiveCategoriesAsync(cancellationToken);
        return categories.Select(category => new CategoryResponse
        {
            Id = category.Id,
            Name = category.Name,
            IsActive = category.IsActive
        }).ToList();
    }

    private async Task<Category> GetActiveCategoryAsync(Guid categoryId, CancellationToken cancellationToken)
    {
        var category = await _store.GetCategoryByIdAsync(categoryId, cancellationToken);
        if (category is null) throw new KeyNotFoundException($"Category '{categoryId}' was not found.");
        if (!category.IsActive) throw new ArgumentException($"Category '{category.Name}' is inactive.", "categoryId");
        return category;
    }

    private Task AddActivityAsync(Guid workItemId, ActivityEventType type, string description, CancellationToken cancellationToken) =>
        _store.AddActivityEventAsync(new ActivityEvent(workItemId, type, description), cancellationToken);

    private static WorkItemPriority ParsePriority(string value, string field)
    {
        var name = Enum.GetNames<WorkItemPriority>().FirstOrDefault(x => string.Equals(x, value, StringComparison.OrdinalIgnoreCase));
        if (name is null) throw new ArgumentException($"Invalid priority value. Valid values are: {string.Join(", ", Enum.GetNames<WorkItemPriority>())}.", field);
        return Enum.Parse<WorkItemPriority>(name);
    }

    private static WorkItemStatus ParseStatus(string value, string field)
    {
        var name = Enum.GetNames<WorkItemStatus>().FirstOrDefault(x => string.Equals(x, value, StringComparison.OrdinalIgnoreCase));
        if (name is null) throw new ArgumentException($"Invalid status. Valid values are: {string.Join(", ", Enum.GetNames<WorkItemStatus>())}.", field);
        return Enum.Parse<WorkItemStatus>(name);
    }

}
