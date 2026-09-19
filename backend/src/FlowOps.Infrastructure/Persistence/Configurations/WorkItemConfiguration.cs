using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FlowOps.Infrastructure.Persistence.Configurations;

public class WorkItemConfiguration : IEntityTypeConfiguration<WorkItem>
{
    public void Configure(EntityTypeBuilder<WorkItem> builder)
    {
        builder.ToTable("WorkItems");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.Title)
            .IsRequired()
            .HasMaxLength(WorkItem.MaxTitleLength);

        builder.Property(x => x.Description)
            .HasMaxLength(WorkItem.MaxDescriptionLength);

        builder.Property(x => x.AssigneeName)
            .HasMaxLength(WorkItem.MaxAssigneeNameLength);

        builder.Property(x => x.Status)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(x => x.Priority)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(x => x.CreatedAtUtc)
            .IsRequired();

        builder.Property(x => x.UpdatedAtUtc)
            .IsRequired();

        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.CreatedAtUtc);
    }
}
