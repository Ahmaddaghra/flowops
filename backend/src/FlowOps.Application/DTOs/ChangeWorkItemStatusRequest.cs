using System.ComponentModel.DataAnnotations;

namespace FlowOps.Application.DTOs;

public class ChangeWorkItemStatusRequest
{
    [Range(1, long.MaxValue)]
    public long ExpectedVersion { get; set; }

    [Required]
    public string Status { get; set; } = string.Empty;
}
