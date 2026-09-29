using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace FlowOps.Infrastructure.Persistence;

public sealed class FlowOpsDbContextFactory : IDesignTimeDbContextFactory<FlowOpsDbContext>
{
    public FlowOpsDbContext CreateDbContext(string[] args)
    {
        // EF tooling builds only persistence; runtime JWT validation remains mandatory.
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? throw new InvalidOperationException("Set ConnectionStrings__DefaultConnection explicitly before running EF migration commands.");
        var options = new DbContextOptionsBuilder<FlowOpsDbContext>().UseNpgsql(connectionString).Options;
        return new FlowOpsDbContext(options);
    }
}
