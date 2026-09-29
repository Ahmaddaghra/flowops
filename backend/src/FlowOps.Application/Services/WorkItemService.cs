using FlowOps.Application.DTOs;
using FlowOps.Application.Exceptions;
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

    public async Task<PagedResult<WorkItemResponse>> ListAsync(WorkItemQuery query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
        ValidateQuery(query);

        var page = await _store.QueryAsync(query, cancellationToken);
        return new PagedResult<WorkItemResponse>
        {
            Items = page.Items.Select(item => WorkItemResponse.FromEntity(item)).ToList(),
            Page = page.Page,
            PageSize = page.PageSize,
            TotalItems = page.TotalItems,
            TotalPages = page.TotalPages
        };
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

        ValidateExpectedVersion(item, request.ExpectedVersion);
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

        ValidateExpectedVersion(item, request.ExpectedVersion);
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

        ValidateExpectedVersion(item, request.ExpectedVersion);
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

    private static void ValidateExpectedVersion(WorkItem item, long expectedVersion)
    {
        if (expectedVersion < 1)
            throw new ArgumentException("ExpectedVersion must be at least 1.", "expectedVersion");
        if (expectedVersion != item.Version)
            throw new WorkItemConcurrencyException();
    }

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

    private static void ValidateQuery(WorkItemQuery query)
    {
        if (query.Page < 1) throw new ArgumentException("Page must be at least 1.", nameof(query.Page));
        if (query.PageSize is < 1 or > 100) throw new ArgumentException("PageSize must be between 1 and 100.", nameof(query.PageSize));
        if (query.Status is not null && !Enum.IsDefined(query.Status.Value))
            throw new ArgumentException("Status is invalid.", nameof(query.Status));
        if (query.Priority is not null && !Enum.IsDefined(query.Priority.Value))
            throw new ArgumentException("Priority is invalid.", nameof(query.Priority));
        if (!new[] { "createdat", "updatedat", "title", "priority", "status" }.Contains(query.Sort, StringComparer.OrdinalIgnoreCase))
            throw new ArgumentException("Sort must be createdAt, updatedAt, title, priority, or status.", nameof(query.Sort));
        if (!string.Equals(query.Direction, "asc", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(query.Direction, "desc", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Direction must be asc or desc.", nameof(query.Direction));
        if (query.Page - 1 > int.MaxValue / query.PageSize)
            throw new ArgumentException("Page is too large for the selected page size.", nameof(query.Page));

        query.Search = query.Search?.Trim();
        query.Assignee = query.Assignee?.Trim();
        query.Sort = query.Sort.ToLowerInvariant();
        query.Direction = query.Direction.ToLowerInvariant();
    }

}
