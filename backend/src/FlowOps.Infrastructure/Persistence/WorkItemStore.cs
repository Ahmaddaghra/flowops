using FlowOps.Application.Interfaces;
using FlowOps.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace FlowOps.Infrastructure.Persistence;

public class WorkItemStore : IWorkItemStore
{
    private readonly FlowOpsDbContext _dbContext;

    public WorkItemStore(FlowOpsDbContext dbContext)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
    }

    public async Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken cancellationToken = default) =>
        await _dbContext.WorkItems.AsNoTracking().Include(x => x.Category)
            .OrderByDescending(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

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

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        await _dbContext.SaveChangesAsync(cancellationToken);
}
