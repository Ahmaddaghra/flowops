namespace FlowOps.Application.Exceptions;

public sealed class ForbiddenOperationException : Exception
{
    public ForbiddenOperationException() : base("You do not have permission to perform this action.") { }
}
