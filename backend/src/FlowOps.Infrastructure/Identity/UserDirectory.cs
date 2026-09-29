using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using FlowOps.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace FlowOps.Infrastructure.Identity;

public sealed class UserDirectory(FlowOpsDbContext dbContext) : IUserDirectory
{
    public async Task<IReadOnlyList<UserSummaryResponse>> ListAsync(CancellationToken cancellationToken = default) =>
        await dbContext.Users.AsNoTracking().Where(user => user.IsActive)
            .OrderBy(user => user.DisplayName).ThenBy(user => user.Id)
            .Select(user => new UserSummaryResponse(user.Id, user.DisplayName))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyDictionary<Guid, UserSummaryResponse>> GetByIdsAsync(IEnumerable<Guid> userIds, CancellationToken cancellationToken = default)
    {
        var ids = userIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, UserSummaryResponse>();
        }

        // Historical actors/assignees retain their display names after deactivation.
        return await dbContext.Users.AsNoTracking().Where(user => ids.Contains(user.Id))
            .Select(user => new UserSummaryResponse(user.Id, user.DisplayName))
            .ToDictionaryAsync(user => user.Id, cancellationToken);
    }

    public Task<bool> ExistsActiveAsync(Guid userId, CancellationToken cancellationToken = default) =>
        dbContext.Users.AsNoTracking().AnyAsync(user => user.Id == userId && user.IsActive, cancellationToken);
}
