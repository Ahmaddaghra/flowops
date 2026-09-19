using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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

    public async Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.WorkItems
            .AsNoTracking()
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task<WorkItem?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _dbContext.WorkItems
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
    }

    public async Task AddAsync(WorkItem item, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(item);
        await _dbContext.WorkItems.AddAsync(item, cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
