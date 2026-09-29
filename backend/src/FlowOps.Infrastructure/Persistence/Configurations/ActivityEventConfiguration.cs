using FlowOps.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FlowOps.Infrastructure.Persistence.Configurations;

public class ActivityEventConfiguration : IEntityTypeConfiguration<ActivityEvent>
{
    public void Configure(EntityTypeBuilder<ActivityEvent> builder)
    {
        builder.ToTable("ActivityEvents");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EventType).HasConversion<string>().HasMaxLength(50).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(ActivityEvent.MaxDescriptionLength).IsRequired();
        builder.Property(x => x.CreatedAtUtc).IsRequired();
        builder.HasOne(x => x.WorkItem)
            .WithMany()
            .HasForeignKey(x => x.WorkItemId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.WorkItemId, x.CreatedAtUtc });
    }
}
