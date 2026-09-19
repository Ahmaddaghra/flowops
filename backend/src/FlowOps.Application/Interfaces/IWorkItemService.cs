using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Application.DTOs;

namespace FlowOps.Application.Interfaces;

public interface IWorkItemService
{
    Task<IReadOnlyList<WorkItemResponse>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<WorkItemResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<WorkItemResponse> CreateAsync(CreateWorkItemRequest request, CancellationToken cancellationToken = default);
}
