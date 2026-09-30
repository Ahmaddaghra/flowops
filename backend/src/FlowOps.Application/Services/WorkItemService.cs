using FlowOps.Application.DTOs;
using FlowOps.Application.Authorization;
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
    private readonly IUserDirectory _users;
    private readonly WorkItemAuthorization _authorization;

    public WorkItemService(IWorkItemStore store, ILogger<WorkItemService> logger, ICurrentUser currentUser, IUserDirectory users)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        ArgumentNullException.ThrowIfNull(currentUser);
        _users = users ?? throw new ArgumentNullException(nameof(users));
        _authorization = new WorkItemAuthorization(currentUser);
    }

    public async Task<PagedResult<WorkItemResponse>> ListAsync(WorkItemQuery query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);
        _authorization.RequireUser();
        ValidateQuery(query);

        var page = await _store.QueryAsync(query, cancellationToken);
        var users = await GetItemUsersAsync(page.Items, cancellationToken);
        return new PagedResult<WorkItemResponse>
        {
            Items = page.Items.Select(item => MapResponse(item, users)).ToList(),
            Page = page.Page,
            PageSize = page.PageSize,
            TotalItems = page.TotalItems,
            TotalPages = page.TotalPages
        };
    }

    public async Task<WorkItemResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _authorization.RequireUser();
        var item = await _store.GetByIdAsync(id, cancellationToken);
        return item is null ? null : await MapResponseAsync(item, cancellationToken);
    }

    public async Task<WorkItemResponse> CreateAsync(CreateWorkItemRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var userId = _authorization.RequireUser();
        _authorization.RequireInitialAssignment(request.AssigneeUserId);
        await ValidateAssigneeAsync(request.AssigneeUserId, cancellationToken);
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
            categoryId: request.CategoryId,
            createdByUserId: userId,
            assigneeUserId: request.AssigneeUserId);

        await _store.AddAsync(item, cancellationToken);
        await _store.AddActivityEventAsync(
            new ActivityEvent(item.Id, ActivityEventType.Created, "Work item created", item.CreatedAtUtc, userId),
            cancellationToken);
        await _store.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Created work item {WorkItemId}", item.Id);
        return await MapResponseAsync(item, cancellationToken, category?.Name);
    }

    public async Task<WorkItemResponse?> UpdateAsync(Guid id, UpdateWorkItemRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        _authorization.RequireUser();
        var item = await _store.GetByIdForUpdateAsync(id, cancellationToken);
        if (item is null) return null;

        _authorization.RequireEdit(item);
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

        return await MapResponseAsync(item, cancellationToken, categoryName);
    }

    public async Task<WorkItemResponse?> ChangeStatusAsync(Guid id, ChangeWorkItemStatusRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        _authorization.RequireUser();
        var item = await _store.GetByIdForUpdateAsync(id, cancellationToken);
        if (item is null) return null;

        _authorization.RequireEdit(item);
        ValidateExpectedVersion(item, request.ExpectedVersion);
        var status = ParseStatus(request.Status, nameof(request.Status));
        var previous = item.Status;
        if (item.ChangeStatus(status))
        {
            await AddActivityAsync(item.Id, ActivityEventType.StatusChanged, $"Status changed from {previous} to {status}", cancellationToken);
            await _store.SaveChangesAsync(cancellationToken);
        }

        return await MapResponseAsync(item, cancellationToken);
    }

    public async Task<WorkItemResponse?> AssignAsync(Guid id, AssignWorkItemRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        _authorization.RequireUser();
        var item = await _store.GetByIdForUpdateAsync(id, cancellationToken);
        if (item is null) return null;

        _authorization.RequireAssignment(item, request.AssigneeUserId);
        ValidateExpectedVersion(item, request.ExpectedVersion);
        await ValidateAssigneeAsync(request.AssigneeUserId, cancellationToken);
        var users = await _users.GetByIdsAsync(
            new[] { item.AssigneeUserId, request.AssigneeUserId }.OfType<Guid>(), cancellationToken);
        var previous = item.AssigneeUserId is Guid previousId && users.TryGetValue(previousId, out var oldUser)
            ? oldUser.DisplayName : null;
        var next = request.AssigneeUserId is Guid nextId ? users[nextId].DisplayName : null;
        if (item.AssignToUser(request.AssigneeUserId))
        {
            var description = next is null
                ? "Work item unassigned"
                : previous is null ? $"Assigned to {next}" : $"Reassigned from {previous} to {next}";
            await AddActivityAsync(item.Id, ActivityEventType.AssignmentChanged, description, cancellationToken);
            await _store.SaveChangesAsync(cancellationToken);
        }

        return await MapResponseAsync(item, cancellationToken);
    }

    public async Task<IReadOnlyList<ActivityEventResponse>?> GetActivityAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _authorization.RequireUser();
        if (await _store.GetByIdAsync(id, cancellationToken) is null) return null;

        var events = await _store.GetActivityAsync(id, cancellationToken);
        var users = await _users.GetByIdsAsync(events.Select(x => x.ActorUserId).OfType<Guid>(), cancellationToken);
        return events.Select(activity => new ActivityEventResponse
        {
            Id = activity.Id,
            WorkItemId = activity.WorkItemId,
            EventType = activity.EventType.ToString(),
            Description = activity.Description,
            CreatedAtUtc = activity.CreatedAtUtc,
            ActorUserId = activity.ActorUserId,
            Actor = activity.ActorUserId is Guid actorId && users.TryGetValue(actorId, out var actor) ? actor : null
        }).ToList();
    }

    public async Task<IReadOnlyList<CategoryResponse>> GetCategoriesAsync(CancellationToken cancellationToken = default)
    {
        _authorization.RequireUser();
        var categories = await _store.ListActiveCategoriesAsync(cancellationToken);
        return categories.Select(category => new CategoryResponse
        {
            Id = category.Id,
            Name = category.Name,
            IsActive = category.IsActive
        }).ToList();
    }

    public async Task<IReadOnlyList<CommentResponse>?> GetCommentsAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _authorization.RequireUser();
        if (await _store.GetByIdAsync(id, cancellationToken) is null) return null;

        var comments = await _store.GetCommentsAsync(id, cancellationToken);
        var users = await _users.GetByIdsAsync(comments.Select(comment => comment.AuthorUserId).Distinct(), cancellationToken);
        return comments.Select(comment => MapComment(comment, users)).ToList();
    }

    public async Task<CommentResponse?> AddCommentAsync(Guid id, CreateCommentRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var authorUserId = _authorization.RequireUser();
        // Comments follow the read boundary; lifecycle mutation permissions and version do not apply.
        if (await _store.GetByIdAsync(id, cancellationToken) is null) return null;

        var comment = new Comment(id, authorUserId, request.Body);
        var users = await _users.GetByIdsAsync([authorUserId], cancellationToken);
        await _store.AddCommentAsync(comment, cancellationToken);
        await _store.AddActivityEventAsync(
            new ActivityEvent(id, ActivityEventType.CommentAdded, "Comment added", comment.CreatedAtUtc, authorUserId),
            cancellationToken);
        await _store.SaveChangesAsync(cancellationToken);

        return MapComment(comment, users);
    }

    private static CommentResponse MapComment(Comment comment, IReadOnlyDictionary<Guid, UserSummaryResponse> users) =>
        new(comment.Id, comment.WorkItemId, comment.Body, comment.CreatedAtUtc,
            users.TryGetValue(comment.AuthorUserId, out var author)
                ? author : new UserSummaryResponse(comment.AuthorUserId, "User unavailable"));

    private async Task<Category> GetActiveCategoryAsync(Guid categoryId, CancellationToken cancellationToken)
    {
        var category = await _store.GetCategoryByIdAsync(categoryId, cancellationToken);
        if (category is null) throw new KeyNotFoundException($"Category '{categoryId}' was not found.");
        if (!category.IsActive) throw new ArgumentException($"Category '{category.Name}' is inactive.", "categoryId");
        return category;
    }

    private Task AddActivityAsync(Guid workItemId, ActivityEventType type, string description, CancellationToken cancellationToken) =>
        _store.AddActivityEventAsync(new ActivityEvent(workItemId, type, description, actorUserId: _authorization.RequireUser()), cancellationToken);

    private async Task ValidateAssigneeAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (userId == Guid.Empty) throw new ArgumentException("AssigneeUserId cannot be empty.", "assigneeUserId");
        if (userId is Guid id && !await _users.ExistsActiveAsync(id, cancellationToken))
            throw new KeyNotFoundException("The active assignee user was not found.");
    }

    private Task<IReadOnlyDictionary<Guid, UserSummaryResponse>> GetItemUsersAsync(
        IEnumerable<WorkItem> items, CancellationToken cancellationToken) =>
        _users.GetByIdsAsync(items.SelectMany(x => new[] { x.CreatedByUserId, x.AssigneeUserId }).OfType<Guid>(), cancellationToken);

    private async Task<WorkItemResponse> MapResponseAsync(WorkItem item, CancellationToken cancellationToken, string? categoryName = null) =>
        MapResponse(item, await GetItemUsersAsync([item], cancellationToken), categoryName);

    private WorkItemResponse MapResponse(WorkItem item, IReadOnlyDictionary<Guid, UserSummaryResponse> users, string? categoryName = null)
    {
        var response = WorkItemResponse.FromEntity(item, categoryName);
        response.CreatedBy = item.CreatedByUserId is Guid creatorId && users.TryGetValue(creatorId, out var creator) ? creator : null;
        response.Assignee = item.AssigneeUserId is Guid assigneeId && users.TryGetValue(assigneeId, out var assignee) ? assignee : null;
        response.AssigneeName = response.Assignee?.DisplayName ?? item.AssigneeName;
        response.Permissions = _authorization.GetPermissions(item);
        return response;
    }

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
