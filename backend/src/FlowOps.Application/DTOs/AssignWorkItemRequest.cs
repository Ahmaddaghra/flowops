using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.DTOs;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class AssignWorkItemRequest
{
    [Range(1, long.MaxValue)]
    public long ExpectedVersion { get; set; }

    public Guid? AssigneeUserId { get; set; }
}
