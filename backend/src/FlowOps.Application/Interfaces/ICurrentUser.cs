namespace FlowOps.Application.Interfaces;

public interface ICurrentUser
{
    Guid? UserId { get; }
    string? DisplayName { get; }
    IReadOnlyList<string> Roles { get; }
    bool IsAuthenticated { get; }
}
