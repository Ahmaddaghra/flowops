using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.Interfaces;

public interface IWorkItemStore
{
    Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken cancellationToken = default);
    Task<WorkItem?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task AddAsync(WorkItem item, CancellationToken cancellationToken = default);
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
