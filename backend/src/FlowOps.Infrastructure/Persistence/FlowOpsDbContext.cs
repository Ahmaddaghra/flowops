using FlowOps.Domain.Entities;
using FlowOps.Application.Authorization;
using FlowOps.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FlowOps.Infrastructure.Persistence;

public class FlowOpsDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public FlowOpsDbContext(DbContextOptions<FlowOpsDbContext> options)
        : base(options)
    {
    }

    public DbSet<WorkItem> WorkItems => Set<WorkItem>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<ActivityEvent> ActivityEvents => Set<ActivityEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<ApplicationUser>(builder =>
        {
            builder.Property(user => user.DisplayName).IsRequired().HasMaxLength(ApplicationUser.MaxDisplayNameLength);
            builder.Property(user => user.IsActive).IsRequired().HasDefaultValue(true);
            builder.Property(user => user.Email).IsRequired();
            builder.Property(user => user.NormalizedEmail).IsRequired();
            builder.HasIndex(user => user.NormalizedEmail).HasDatabaseName("EmailIndex").IsUnique();
        });
        modelBuilder.Entity<IdentityRole<Guid>>().HasData(
            new IdentityRole<Guid>
            {
                Id = Guid.Parse("20000000-0000-0000-0000-000000000001"),
                Name = AppRoles.Admin,
                NormalizedName = AppRoles.Admin.ToUpperInvariant(),
                ConcurrencyStamp = "20000000-0000-0000-0000-000000000001"
            },
            new IdentityRole<Guid>
            {
                Id = Guid.Parse("20000000-0000-0000-0000-000000000002"),
                Name = AppRoles.Member,
                NormalizedName = AppRoles.Member.ToUpperInvariant(),
                ConcurrencyStamp = "20000000-0000-0000-0000-000000000002"
            });
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FlowOpsDbContext).Assembly);
    }
}
