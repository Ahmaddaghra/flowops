namespace FlowOps.Domain.Entities;

public class Category
{
    public const int MaxNameLength = 100;

    public Guid Id { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string NameKey { get; private set; } = string.Empty;
    public bool IsActive { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private Category() { }

    public Category(Guid id, string name, bool isActive = true, DateTime? createdAtUtc = null)
    {
        if (id == Guid.Empty) throw new ArgumentException("Category ID is required.", nameof(id));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Category name is required.", nameof(name));

        var trimmed = name.Trim();
        if (trimmed.Length > MaxNameLength)
            throw new ArgumentException($"Category name cannot exceed {MaxNameLength} characters.", nameof(name));

        Id = id;
        Name = trimmed;
        NameKey = trimmed.ToUpperInvariant();
        IsActive = isActive;
        var created = createdAtUtc ?? DateTime.UtcNow;
        CreatedAtUtc = created.Kind == DateTimeKind.Utc ? created : DateTime.SpecifyKind(created, DateTimeKind.Utc);
    }
}
