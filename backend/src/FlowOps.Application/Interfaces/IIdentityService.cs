using FlowOps.Application.DTOs;

namespace FlowOps.Application.Interfaces;

public interface IIdentityService
{
    Task<IdentityOperationResult<AuthUserResponse>> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default);
    Task<AuthUserResponse?> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default);
    Task<AuthUserResponse?> GetUserAsync(Guid userId, CancellationToken cancellationToken = default);
}
