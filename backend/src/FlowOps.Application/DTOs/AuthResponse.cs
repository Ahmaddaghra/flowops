namespace FlowOps.Application.DTOs;

public sealed record AuthResponse(string AccessToken, DateTime ExpiresAtUtc, AuthUserResponse User);
