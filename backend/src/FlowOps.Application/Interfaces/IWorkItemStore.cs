using System;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.Interfaces;

public interface IWorkItemStore
{
    Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken cancellationToken = default);
    Task<WorkItem?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<WorkItem?> GetByIdForUpdateAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Category?> GetCategoryByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Category>> ListActiveCategoriesAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ActivityEvent>> GetActivityAsync(Guid workItemId, CancellationToken cancellationToken = default);
    Task AddAsync(WorkItem item, CancellationToken cancellationToken = default);
    Task AddActivityEventAsync(ActivityEvent activityEvent, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
