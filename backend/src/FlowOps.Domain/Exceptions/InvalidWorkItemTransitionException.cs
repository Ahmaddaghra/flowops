using FlowOps.Domain.Enums;
using System;

namespace FlowOps.Domain.Exceptions;

public sealed class InvalidWorkItemTransitionException : Exception
{
    public WorkItemStatus CurrentStatus { get; }
    public WorkItemStatus RequestedStatus { get; }

    public InvalidWorkItemTransitionException(WorkItemStatus currentStatus, WorkItemStatus requestedStatus)
        : base($"A work item cannot transition from {currentStatus} to {requestedStatus}.")
    {
        CurrentStatus = currentStatus;
        RequestedStatus = requestedStatus;
    }
}
