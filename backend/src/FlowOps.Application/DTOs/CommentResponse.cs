namespace FlowOps.Application.DTOs;

public sealed record CommentResponse(
    Guid Id,
    Guid WorkItemId,
    string Body,
    DateTime CreatedAtUtc,
    UserSummaryResponse Author);
