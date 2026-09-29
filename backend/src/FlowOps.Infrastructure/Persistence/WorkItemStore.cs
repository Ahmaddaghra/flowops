using FlowOps.Application.DTOs;
using FlowOps.Application.Exceptions;
using FlowOps.Application.Interfaces;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;

namespace FlowOps.Infrastructure.Persistence;

public class WorkItemStore : IWorkItemStore
{
    private readonly FlowOpsDbContext _dbContext;

    public WorkItemStore(FlowOpsDbContext dbContext)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
    }

    public async Task<PagedResult<WorkItem>> QueryAsync(WorkItemQuery query, CancellationToken cancellationToken = default)
    {
        IQueryable<WorkItem> items = _dbContext.WorkItems.AsNoTracking().Include(x => x.Category);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = $"%{EscapeLike(query.Search)}%";
            items = items.Where(x =>
                EF.Functions.ILike(x.Title, search, "\\") ||
                (x.Description != null && EF.Functions.ILike(x.Description, search, "\\")) ||
                (x.AssigneeName != null && EF.Functions.ILike(x.AssigneeName, search, "\\")));
        }

        if (query.Status is WorkItemStatus status) items = items.Where(x => x.Status == status);
        if (query.Priority is WorkItemPriority priority) items = items.Where(x => x.Priority == priority);
        if (query.CategoryId is Guid categoryId) items = items.Where(x => x.CategoryId == categoryId);
        if (!string.IsNullOrWhiteSpace(query.Assignee))
            items = items.Where(x => x.AssigneeName != null && EF.Functions.ILike(x.AssigneeName, $"%{EscapeLike(query.Assignee)}%", "\\"));

        var totalItems = await items.CountAsync(cancellationToken);
        var pageItems = await ApplyOrdering(items, query.Sort, query.Direction)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<WorkItem>
        {
            Items = pageItems,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = totalItems,
            TotalPages = totalItems == 0 ? 0 : (int)Math.Ceiling(totalItems / (double)query.PageSize)
        };
    }

    public Task<WorkItem?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        _dbContext.WorkItems.AsNoTracking().Include(x => x.Category)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public Task<WorkItem?> GetByIdForUpdateAsync(Guid id, CancellationToken cancellationToken = default) =>
        _dbContext.WorkItems.Include(x => x.Category)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public Task<Category?> GetCategoryByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        _dbContext.Categories.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Category>> ListActiveCategoriesAsync(CancellationToken cancellationToken = default) =>
        await _dbContext.Categories.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Name).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ActivityEvent>> GetActivityAsync(Guid workItemId, CancellationToken cancellationToken = default) =>
        await _dbContext.ActivityEvents.AsNoTracking()
            .Where(x => x.WorkItemId == workItemId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ThenByDescending(x => x.Id)
            .ToListAsync(cancellationToken);

    public async Task AddAsync(WorkItem item, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(item);
        await _dbContext.WorkItems.AddAsync(item, cancellationToken);
    }

    public async Task AddActivityEventAsync(ActivityEvent activityEvent, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(activityEvent);
        await _dbContext.ActivityEvents.AddAsync(activityEvent, cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new WorkItemConcurrencyException();
        }
    }

    private static IOrderedQueryable<WorkItem> ApplyOrdering(IQueryable<WorkItem> items, string sort, string direction)
    {
        var descending = direction == "desc";
        return sort switch
        {
            "updatedat" => descending
                ? items.OrderByDescending(x => x.UpdatedAtUtc).ThenBy(x => x.Id)
                : items.OrderBy(x => x.UpdatedAtUtc).ThenBy(x => x.Id),
            "title" => descending
                ? items.OrderByDescending(x => x.Title).ThenBy(x => x.Id)
                : items.OrderBy(x => x.Title).ThenBy(x => x.Id),
            "priority" => OrderByPriority(items, descending),
            "status" => OrderByStatus(items, descending),
            _ => descending
                ? items.OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id)
                : items.OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
        };
    }

    private static IOrderedQueryable<WorkItem> OrderByPriority(IQueryable<WorkItem> items, bool descending)
    {
        Expression<Func<WorkItem, int>> rank = x => x.Priority == WorkItemPriority.Low ? 0
            : x.Priority == WorkItemPriority.Medium ? 1
            : x.Priority == WorkItemPriority.High ? 2 : 3;
        return descending ? items.OrderByDescending(rank).ThenBy(x => x.Id) : items.OrderBy(rank).ThenBy(x => x.Id);
    }

    private static IOrderedQueryable<WorkItem> OrderByStatus(IQueryable<WorkItem> items, bool descending)
    {
        Expression<Func<WorkItem, int>> rank = x => x.Status == WorkItemStatus.Todo ? 0
            : x.Status == WorkItemStatus.InProgress ? 1
            : x.Status == WorkItemStatus.Blocked ? 2 : 3;
        return descending ? items.OrderByDescending(rank).ThenBy(x => x.Id) : items.OrderBy(rank).ThenBy(x => x.Id);
    }

    private static string EscapeLike(string value) => value.Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace("%", "\\%", StringComparison.Ordinal)
        .Replace("_", "\\_", StringComparison.Ordinal);
}
