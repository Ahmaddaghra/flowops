using FlowOps.Application.Authorization;
using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using FlowOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace FlowOps.Infrastructure.Identity;

public sealed class IdentityService(UserManager<ApplicationUser> userManager, FlowOpsDbContext dbContext) : IIdentityService
{
    public async Task<IdentityOperationResult<AuthUserResponse>> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = request.Email.Trim(),
            Email = request.Email.Trim(),
            DisplayName = request.DisplayName.Trim(),
            IsActive = true
        };

        if (string.IsNullOrWhiteSpace(user.DisplayName) || user.DisplayName.Length > ApplicationUser.MaxDisplayNameLength)
        {
            return IdentityOperationResult<AuthUserResponse>.Failure(new Dictionary<string, string[]>
            {
                ["displayName"] = ["Display name is required and cannot exceed 100 characters."]
            });
        }

        // Creating the account and its Member role is one database transaction.
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var result = await userManager.CreateAsync(user, request.Password);
            if (!result.Succeeded)
            {
                return IdentityOperationResult<AuthUserResponse>.Failure(ToErrors(result));
            }

            var roleResult = await userManager.AddToRoleAsync(user, AppRoles.Member);
            if (!roleResult.Succeeded)
            {
                throw new InvalidOperationException("Unable to assign the Member role. Apply the Identity migrations before registering users.");
            }

            await transaction.CommitAsync(cancellationToken);
            return IdentityOperationResult<AuthUserResponse>.Success(await ToResponseAsync(user));
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "EmailIndex" or "UserNameIndex"
        })
        {
            // The unique database indexes also protect concurrent registrations.
            return IdentityOperationResult<AuthUserResponse>.Failure(new Dictionary<string, string[]>
            {
                ["email"] = ["An account with this email already exists."]
            });
        }
    }

    public async Task<AuthUserResponse?> LoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null || !user.IsActive || await userManager.IsLockedOutAsync(user))
        {
            return null;
        }

        if (!await userManager.CheckPasswordAsync(user, request.Password))
        {
            await userManager.AccessFailedAsync(user);
            return null;
        }

        var resetResult = await userManager.ResetAccessFailedCountAsync(user);
        return resetResult.Succeeded ? await ToResponseAsync(user) : null;
    }

    public async Task<AuthUserResponse?> GetUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var user = await userManager.FindByIdAsync(userId.ToString());
        return user is { IsActive: true } ? await ToResponseAsync(user) : null;
    }

    private async Task<AuthUserResponse> ToResponseAsync(ApplicationUser user) =>
        new(user.Id, user.Email!, user.DisplayName, (await userManager.GetRolesAsync(user)).Order(StringComparer.Ordinal).ToArray());

    private static IReadOnlyDictionary<string, string[]> ToErrors(IdentityResult result) =>
        result.Errors.GroupBy(error => error.Code.StartsWith("Password", StringComparison.Ordinal) ? "password" : "email")
            .ToDictionary(group => group.Key, group => group.Select(error => error.Description).ToArray());
}
