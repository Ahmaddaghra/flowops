using System.ComponentModel.DataAnnotations;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.DTOs;

public class AssignWorkItemRequest
{
    [Range(1, long.MaxValue)]
    public long ExpectedVersion { get; set; }

    [StringLength(WorkItem.MaxAssigneeNameLength)]
    public string? AssigneeName { get; set; }
}
