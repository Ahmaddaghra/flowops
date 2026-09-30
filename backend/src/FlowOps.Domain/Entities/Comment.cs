namespace FlowOps.Domain.Entities;

public class Comment
{
    public const int MaxBodyLength = 2000;

    public Guid Id { get; private set; }
    public Guid WorkItemId { get; private set; }
    public Guid AuthorUserId { get; private set; }
    public string Body { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; }

    private Comment() { }

    public Comment(Guid workItemId, Guid authorUserId, string body, DateTime? createdAtUtc = null)
    {
        if (workItemId == Guid.Empty) throw new ArgumentException("Work item ID is required.", nameof(workItemId));
        if (authorUserId == Guid.Empty) throw new ArgumentException("Author user ID is required.", nameof(authorUserId));
        if (string.IsNullOrWhiteSpace(body))
            throw new ArgumentException("Comment body is required and cannot be empty or whitespace.", nameof(body));
        if (body.Length > MaxBodyLength)
            throw new ArgumentException($"Comment body cannot exceed {MaxBodyLength} characters.", nameof(body));

        Id = Guid.NewGuid();
        WorkItemId = workItemId;
        AuthorUserId = authorUserId;
        Body = body.Trim();
        var created = createdAtUtc ?? DateTime.UtcNow;
        CreatedAtUtc = created.Kind == DateTimeKind.Utc ? created : DateTime.SpecifyKind(created, DateTimeKind.Utc);
    }
}
