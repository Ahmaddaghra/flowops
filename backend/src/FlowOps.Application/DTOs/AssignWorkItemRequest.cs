using System.ComponentModel.DataAnnotations;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.DTOs;

public class AssignWorkItemRequest
{
    [StringLength(WorkItem.MaxAssigneeNameLength)]
    public string? AssigneeName { get; set; }
}
