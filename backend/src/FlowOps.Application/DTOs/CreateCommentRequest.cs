using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using FlowOps.Domain.Entities;

namespace FlowOps.Application.DTOs;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class CreateCommentRequest
{
    [Required(ErrorMessage = "Comment body is required.")]
    [StringLength(Comment.MaxBodyLength, ErrorMessage = "Comment body cannot exceed 2000 characters.")]
    public string Body { get; set; } = string.Empty;
}
