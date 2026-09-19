using FlowOps.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace FlowOps.Infrastructure.Persistence;

public class FlowOpsDbContext : DbContext
{
    public FlowOpsDbContext(DbContextOptions<FlowOpsDbContext> options)
        : base(options)
    {
    }

    public DbSet<WorkItem> WorkItems => Set<WorkItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FlowOpsDbContext).Assembly);
    }
}
