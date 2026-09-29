using System.ComponentModel.DataAnnotations;
using FlowOps.Domain.Enums;

namespace FlowOps.Application.DTOs;

public class WorkItemQuery
{
    [StringLength(200)]
    public string? Search { get; set; }

    public WorkItemStatus? Status { get; set; }
    public WorkItemPriority? Priority { get; set; }
    public Guid? CategoryId { get; set; }

    [StringLength(100)]
    public string? Assignee { get; set; }

    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 20;

    [StringLength(20)]
    public string Sort { get; set; } = "createdAt";

    [StringLength(4)]
    public string Direction { get; set; } = "desc";
}
