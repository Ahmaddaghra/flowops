namespace FlowOps.Application.DTOs;

public class ActivityEventResponse
{
    public Guid Id { get; init; }
    public Guid WorkItemId { get; init; }
    public string EventType { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public DateTime CreatedAtUtc { get; init; }
    public Guid? ActorUserId { get; init; }
}
