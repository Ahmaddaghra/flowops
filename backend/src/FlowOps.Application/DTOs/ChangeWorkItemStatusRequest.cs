using System.ComponentModel.DataAnnotations;

namespace FlowOps.Application.DTOs;

public class ChangeWorkItemStatusRequest
{
    [Required]
    public string Status { get; set; } = string.Empty;
}
