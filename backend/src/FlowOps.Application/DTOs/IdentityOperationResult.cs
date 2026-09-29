namespace FlowOps.Application.DTOs;

public sealed record IdentityOperationResult<T>(T? Value, IReadOnlyDictionary<string, string[]> Errors)
    where T : class
{
    public bool Succeeded => Value is not null;

    public static IdentityOperationResult<T> Success(T value) => new(value, new Dictionary<string, string[]>());

    public static IdentityOperationResult<T> Failure(IReadOnlyDictionary<string, string[]> errors) => new(null, errors);
}
