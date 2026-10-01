using FlowOps.Application.Authorization;
using FlowOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace FlowOps.Infrastructure.Identity;

public static class DevelopmentAdminBootstrap
{
    public static async Task SeedAsync(IHostEnvironment environment, IConfiguration configuration,
        UserManager<ApplicationUser> userManager, RoleManager<IdentityRole<Guid>> roleManager,
        FlowOpsDbContext dbContext, CancellationToken cancellationToken = default)
    {
        if (!environment.IsDevelopment())
        {
            return;
        }

        var email = configuration["FLOWOPS_SEED_ADMIN_EMAIL"];
        var password = configuration["FLOWOPS_SEED_ADMIN_PASSWORD"];
        var displayName = configuration["FLOWOPS_SEED_ADMIN_DISPLAY_NAME"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(displayName))
        {
            return;
        }

        var existing = await userManager.FindByEmailAsync(email.Trim());
        if (existing is not null)
        {
            if (!await userManager.IsInRoleAsync(existing, AppRoles.Admin))
            {
                throw new InvalidOperationException("The configured development admin email already belongs to a non-admin account.");
            }

            return;
        }

        if (!await roleManager.RoleExistsAsync(AppRoles.Admin))
        {
            throw new InvalidOperationException("Apply the Identity migrations before enabling the development admin bootstrap.");
        }

        if (displayName.Trim().Length > ApplicationUser.MaxDisplayNameLength)
        {
            throw new InvalidOperationException("The development admin display name cannot exceed 100 characters.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email.Trim(),
            Email = email.Trim(),
            DisplayName = displayName.Trim(),
            IsActive = true
        };
        var created = await userManager.CreateAsync(user, password);
        if (!created.Succeeded)
        {
            throw new InvalidOperationException($"Development admin bootstrap failed Identity validation ({string.Join(", ", created.Errors.Select(error => error.Code))}).");
        }

        var assigned = await userManager.AddToRoleAsync(user, AppRoles.Admin);
        if (!assigned.Succeeded)
        {
            throw new InvalidOperationException("Development admin bootstrap could not assign the Admin role.");
        }

        await transaction.CommitAsync(cancellationToken);
    }
}
