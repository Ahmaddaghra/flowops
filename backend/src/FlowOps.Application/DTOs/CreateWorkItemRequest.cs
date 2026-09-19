using System.ComponentModel.DataAnnotations;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;

namespace FlowOps.Application.DTOs;

public class CreateWorkItemRequest
{
    [Required(ErrorMessage = "Title is required.")]
    [StringLength(WorkItem.MaxTitleLength, ErrorMessage = "Title cannot exceed 200 characters.")]
    public string Title { get; set; } = string.Empty;

    [StringLength(WorkItem.MaxDescriptionLength, ErrorMessage = "Description cannot exceed 4000 characters.")]
    public string? Description { get; set; }

    public string Priority { get; set; } = nameof(WorkItemPriority.Medium);

    [StringLength(WorkItem.MaxAssigneeNameLength, ErrorMessage = "AssigneeName cannot exceed 100 characters.")]
    public string? AssigneeName { get; set; }
}
