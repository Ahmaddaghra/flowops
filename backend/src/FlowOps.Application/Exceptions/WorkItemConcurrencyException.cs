namespace FlowOps.Application.Exceptions;

public sealed class WorkItemConcurrencyException : Exception
{
    public const string ConflictDetail = "This work item was modified by another request. Refresh it and try again.";

    public WorkItemConcurrencyException()
        : base(ConflictDetail)
    {
    }
}
