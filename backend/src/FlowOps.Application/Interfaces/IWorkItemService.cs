using System;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Application.DTOs;

namespace FlowOps.Application.Interfaces;

public interface IWorkItemService
{
    Task<PagedResult<WorkItemResponse>> ListAsync(WorkItemQuery query, CancellationToken cancellationToken = default);
    Task<WorkItemResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<WorkItemResponse> CreateAsync(CreateWorkItemRequest request, CancellationToken cancellationToken = default);
    Task<WorkItemResponse?> UpdateAsync(Guid id, UpdateWorkItemRequest request, CancellationToken cancellationToken = default);
    Task<WorkItemResponse?> ChangeStatusAsync(Guid id, ChangeWorkItemStatusRequest request, CancellationToken cancellationToken = default);
    Task<WorkItemResponse?> AssignAsync(Guid id, AssignWorkItemRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ActivityEventResponse>?> GetActivityAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CommentResponse>?> GetCommentsAsync(Guid id, CancellationToken cancellationToken = default);
    Task<CommentResponse?> AddCommentAsync(Guid id, CreateCommentRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CategoryResponse>> GetCategoriesAsync(CancellationToken cancellationToken = default);
}
