namespace FlowOps.Application.DTOs;

public class CategoryResponse
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public bool IsActive { get; init; }
}
