using System;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.DTOs;

public class WorkItemResponse
{
    public Guid Id { get; set; }
    public long Version { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public Guid? AssigneeUserId { get; set; }
    public UserSummaryResponse? CreatedBy { get; set; }
    public UserSummaryResponse? Assignee { get; set; }
    public WorkItemPermissions? Permissions { get; set; }
    public string? LegacyAssigneeName { get; set; }
    public string? AssigneeName { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    public static WorkItemResponse FromEntity(WorkItem entity, string? categoryName = null)
    {
        return new WorkItemResponse
        {
            Id = entity.Id,
            Version = entity.Version,
            Title = entity.Title,
            Description = entity.Description,
            Status = entity.Status.ToString(),
            Priority = entity.Priority.ToString(),
            CategoryId = entity.CategoryId,
            CategoryName = categoryName ?? entity.Category?.Name,
            CreatedByUserId = entity.CreatedByUserId,
            AssigneeUserId = entity.AssigneeUserId,
            LegacyAssigneeName = entity.AssigneeName,
            AssigneeName = entity.AssigneeName,
            CreatedAtUtc = entity.CreatedAtUtc,
            UpdatedAtUtc = entity.UpdatedAtUtc
        };
    }
}
