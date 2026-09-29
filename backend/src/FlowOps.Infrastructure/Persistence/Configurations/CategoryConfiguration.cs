using FlowOps.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FlowOps.Infrastructure.Persistence.Configurations;

public class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    private static readonly DateTime SeededAtUtc = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("Categories");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(Category.MaxNameLength);
        builder.Property(x => x.NameKey).IsRequired().HasMaxLength(Category.MaxNameLength);
        builder.Property(x => x.IsActive).IsRequired();
        builder.Property(x => x.CreatedAtUtc).IsRequired();
        builder.HasIndex(x => x.NameKey).IsUnique();

        builder.HasData(
            new Category(Guid.Parse("10000000-0000-0000-0000-000000000001"), "Operations", createdAtUtc: SeededAtUtc),
            new Category(Guid.Parse("10000000-0000-0000-0000-000000000002"), "Support", createdAtUtc: SeededAtUtc),
            new Category(Guid.Parse("10000000-0000-0000-0000-000000000003"), "Engineering", createdAtUtc: SeededAtUtc),
            new Category(Guid.Parse("10000000-0000-0000-0000-000000000004"), "Billing", createdAtUtc: SeededAtUtc));
    }
}
