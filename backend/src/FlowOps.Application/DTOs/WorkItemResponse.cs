using System;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.DTOs;

public class WorkItemResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public string? AssigneeName { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    public static WorkItemResponse FromEntity(WorkItem entity)
    {
        return new WorkItemResponse
        {
            Id = entity.Id,
            Title = entity.Title,
            Description = entity.Description,
            Status = entity.Status.ToString(),
            Priority = entity.Priority.ToString(),
            AssigneeName = entity.AssigneeName,
            CreatedAtUtc = entity.CreatedAtUtc,
            UpdatedAtUtc = entity.UpdatedAtUtc
        };
    }
}
