using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using Microsoft.Extensions.Logging;

namespace FlowOps.Application.Services;

public class WorkItemService : IWorkItemService
{
    private readonly IWorkItemStore _workItemStore;
    private readonly ILogger<WorkItemService> _logger;

    public WorkItemService(IWorkItemStore workItemStore, ILogger<WorkItemService> logger)
    {
        _workItemStore = workItemStore ?? throw new ArgumentNullException(nameof(workItemStore));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<IReadOnlyList<WorkItemResponse>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Retrieving all work items.");

        var items = await _workItemStore.ListAsync(cancellationToken);

        return items.Select(WorkItemResponse.FromEntity).ToList();
    }

    public async Task<WorkItemResponse?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Retrieving work item with ID: {WorkItemId}", id);

        var item = await _workItemStore.GetByIdAsync(id, cancellationToken);

        return item == null ? null : WorkItemResponse.FromEntity(item);
    }

    public async Task<WorkItemResponse> CreateAsync(CreateWorkItemRequest request, CancellationToken cancellationToken = default)
    {
        if (request == null)
        {
            throw new ArgumentNullException(nameof(request));
        }

        _logger.LogInformation("Creating work item with title: '{Title}'", request.Title);

        if (!Enum.TryParse<WorkItemPriority>(request.Priority, true, out var priority))
        {
            throw new ArgumentException($"Invalid priority value: '{request.Priority}'. Valid values are: {string.Join(", ", Enum.GetNames<WorkItemPriority>())}.", nameof(request.Priority));
        }

        var workItem = new WorkItem(
            title: request.Title,
            description: request.Description,
            priority: priority,
            assigneeName: request.AssigneeName
        );

        await _workItemStore.AddAsync(workItem, cancellationToken);
        await _workItemStore.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Successfully created work item {WorkItemId}", workItem.Id);

        return WorkItemResponse.FromEntity(workItem);
    }
}
