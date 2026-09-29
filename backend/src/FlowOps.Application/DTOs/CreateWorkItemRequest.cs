using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;

namespace FlowOps.Application.DTOs;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class CreateWorkItemRequest
{
    [Required(ErrorMessage = "Title is required.")]
    [StringLength(WorkItem.MaxTitleLength, ErrorMessage = "Title cannot exceed 200 characters.")]
    public string Title { get; set; } = string.Empty;

    [StringLength(WorkItem.MaxDescriptionLength, ErrorMessage = "Description cannot exceed 4000 characters.")]
    public string? Description { get; set; }

    [Required]
    public string Priority { get; set; } = nameof(WorkItemPriority.Medium);

    public Guid? CategoryId { get; set; }

    public Guid? AssigneeUserId { get; set; }
}
