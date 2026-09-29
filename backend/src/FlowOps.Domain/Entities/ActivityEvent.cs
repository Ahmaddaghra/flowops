using FlowOps.Domain.Enums;

namespace FlowOps.Domain.Entities;

public class ActivityEvent
{
    public const int MaxDescriptionLength = 1000;

    public Guid Id { get; private set; }
    public Guid WorkItemId { get; private set; }
    public WorkItem? WorkItem { get; private set; }
    public ActivityEventType EventType { get; private set; }
    public string Description { get; private set; } = string.Empty;
    public DateTime CreatedAtUtc { get; private set; }
    public Guid? ActorUserId { get; private set; }

    private ActivityEvent() { }

    public ActivityEvent(Guid workItemId, ActivityEventType eventType, string description, DateTime? createdAtUtc = null, Guid? actorUserId = null)
    {
        if (workItemId == Guid.Empty) throw new ArgumentException("Work item ID is required.", nameof(workItemId));
        if (!Enum.IsDefined(eventType)) throw new ArgumentException("Invalid activity event type.", nameof(eventType));
        if (string.IsNullOrWhiteSpace(description)) throw new ArgumentException("Activity description is required.", nameof(description));
        if (description.Length > MaxDescriptionLength)
            throw new ArgumentException($"Activity description cannot exceed {MaxDescriptionLength} characters.", nameof(description));

        Id = Guid.NewGuid();
        WorkItemId = workItemId;
        EventType = eventType;
        Description = description.Trim();
        ActorUserId = actorUserId;
        var created = createdAtUtc ?? DateTime.UtcNow;
        CreatedAtUtc = created.Kind == DateTimeKind.Utc ? created : DateTime.SpecifyKind(created, DateTimeKind.Utc);
    }
}
