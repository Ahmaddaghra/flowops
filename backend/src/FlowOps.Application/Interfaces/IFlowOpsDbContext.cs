using System.Threading;
using System.Threading.Tasks;
using FlowOps.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace FlowOps.Application.Interfaces;

public interface IFlowOpsDbContext
{
    DbSet<WorkItem> WorkItems { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
