namespace FlowOps.Application.DTOs;

public sealed record AuthUserResponse(Guid Id, string Email, string DisplayName, IReadOnlyList<string> Roles);
