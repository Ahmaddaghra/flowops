using FlowOps.Application.DTOs;

namespace FlowOps.Application.Interfaces;

public interface IUserDirectory
{
    Task<IReadOnlyList<UserSummaryResponse>> ListAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<Guid, UserSummaryResponse>> GetByIdsAsync(IEnumerable<Guid> userIds, CancellationToken cancellationToken = default);
    Task<bool> ExistsActiveAsync(Guid userId, CancellationToken cancellationToken = default);
}
