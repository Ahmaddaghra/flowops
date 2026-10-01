using Microsoft.AspNetCore.Identity;

namespace FlowOps.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public const int MaxDisplayNameLength = 100;

    public string DisplayName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
