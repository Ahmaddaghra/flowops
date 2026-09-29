using FlowOps.Domain.Entities;
using FlowOps.Infrastructure.Identity;
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
        builder.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(x => x.CreatedByUserId);
        builder.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.AssigneeUserId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(x => x.AssigneeUserId);


        builder.Property(x => x.Version)
            .HasDefaultValue(1L)
            .IsConcurrencyToken();

        builder.Property(x => x.Title)
            .IsRequired()
            .HasMaxLength(WorkItem.MaxTitleLength);

        builder.Property(x => x.Description)
            .HasMaxLength(WorkItem.MaxDescriptionLength);

        builder.Property(x => x.AssigneeName)
            .HasMaxLength(WorkItem.MaxAssigneeNameLength);

        builder.Property(x => x.CategoryId);
        builder.HasOne(x => x.Category)
            .WithMany()
            .HasForeignKey(x => x.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

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
        builder.HasIndex(x => x.Priority);
        builder.HasIndex(x => x.CategoryId);
        builder.HasIndex(x => x.AssigneeName);
    }
}
