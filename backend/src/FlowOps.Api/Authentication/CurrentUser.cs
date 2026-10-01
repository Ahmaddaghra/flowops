using System.Security.Claims;
using FlowOps.Application.Interfaces;

namespace FlowOps.Api.Authentication;

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => httpContextAccessor.HttpContext?.User;

    public Guid? UserId => Guid.TryParse(Principal?.FindFirstValue("sub"), out var id) && id != Guid.Empty ? id : null;
    public string? DisplayName => Principal?.FindFirstValue("name");
    public IReadOnlyList<string> Roles => Principal?.FindAll("role").Select(claim => claim.Value).ToArray() ?? [];
    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true && UserId.HasValue;
}
