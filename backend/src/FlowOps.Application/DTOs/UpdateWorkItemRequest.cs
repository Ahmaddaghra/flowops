using System.ComponentModel.DataAnnotations;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.DTOs;

public class UpdateWorkItemRequest
{
    [Range(1, long.MaxValue)]
    public long ExpectedVersion { get; set; }

    [Required]
    [StringLength(WorkItem.MaxTitleLength)]
    public string Title { get; set; } = string.Empty;

    [StringLength(WorkItem.MaxDescriptionLength)]
    public string? Description { get; set; }

    [Required]
    public string Priority { get; set; } = string.Empty;

    public Guid? CategoryId { get; set; }
}
