using FlowOps.Domain.Entities;
using FlowOps.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FlowOps.Infrastructure.Persistence.Configurations;

public class CommentConfiguration : IEntityTypeConfiguration<Comment>
{
    public void Configure(EntityTypeBuilder<Comment> builder)
    {
        builder.ToTable("Comments");
        builder.HasKey(comment => comment.Id);
        builder.Property(comment => comment.Body).HasMaxLength(Comment.MaxBodyLength).IsRequired();
        builder.Property(comment => comment.CreatedAtUtc).IsRequired();
        builder.HasOne<WorkItem>().WithMany().HasForeignKey(comment => comment.WorkItemId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<ApplicationUser>().WithMany().HasForeignKey(comment => comment.AuthorUserId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(comment => new { comment.WorkItemId, comment.CreatedAtUtc });
    }
}
