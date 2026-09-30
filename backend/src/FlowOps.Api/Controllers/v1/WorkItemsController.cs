using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using FlowOps.Application.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FlowOps.Api.Controllers.v1;

[Authorize(Roles = AppRoles.Admin + "," + AppRoles.Member)]
[ApiController]
[Route("api/v1/work-items")]
public class WorkItemsController : ControllerBase
{
    private readonly IWorkItemService _workItemService;

    public WorkItemsController(IWorkItemService workItemService)
    {
        _workItemService = workItemService ?? throw new ArgumentNullException(nameof(workItemService));
    }

    /// <summary>Lists work items using server-side search, filters, sorting, and pagination.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<WorkItemResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PagedResult<WorkItemResponse>>> GetAll([FromQuery] WorkItemQuery query, CancellationToken cancellationToken)
    {
        return Ok(await _workItemService.ListAsync(query, cancellationToken));
    }

    /// <summary>Retrieves a work item by its unique ID.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(WorkItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<WorkItemResponse>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var item = await _workItemService.GetByIdAsync(id, cancellationToken);
        return item is null ? NotFoundProblem($"Work item '{id}' was not found.") : Ok(item);
    }

    /// <summary>Creates a work item and its initial activity event.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(WorkItemResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<WorkItemResponse>> Create([FromBody] CreateWorkItemRequest request, CancellationToken cancellationToken)
    {
        var item = await _workItemService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }

    /// <summary>Updates title, description, priority, and category only. Status changes use the dedicated workflow endpoint.</summary>
    [HttpPatch("{id:guid}")]
    [ProducesResponseType(typeof(WorkItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<WorkItemResponse>> Update(Guid id, [FromBody] UpdateWorkItemRequest request, CancellationToken cancellationToken)
    {
        var item = await _workItemService.UpdateAsync(id, request, cancellationToken);
        return item is null ? NotFoundProblem($"Work item '{id}' was not found.") : Ok(item);
    }

    /// <summary>Moves a work item through an allowed status transition.</summary>
    [HttpPost("{id:guid}/status")]
    [ProducesResponseType(typeof(WorkItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<WorkItemResponse>> ChangeStatus(Guid id, [FromBody] ChangeWorkItemStatusRequest request, CancellationToken cancellationToken)
    {
        var item = await _workItemService.ChangeStatusAsync(id, request, cancellationToken);
        return item is null ? NotFoundProblem($"Work item '{id}' was not found.") : Ok(item);
    }

    /// <summary>Assigns an active user, or unassigns when assigneeUserId is null.</summary>
    [HttpPost("{id:guid}/assign")]
    [ProducesResponseType(typeof(WorkItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<WorkItemResponse>> Assign(Guid id, [FromBody] AssignWorkItemRequest request, CancellationToken cancellationToken)
    {
        var item = await _workItemService.AssignAsync(id, request, cancellationToken);
        return item is null ? NotFoundProblem($"Work item '{id}' was not found.") : Ok(item);
    }

    /// <summary>Returns newest-first activity history for a work item.</summary>
    [HttpGet("{id:guid}/activity")]
    [ProducesResponseType(typeof(IReadOnlyList<ActivityEventResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<ActivityEventResponse>>> GetActivity(Guid id, CancellationToken cancellationToken)
    {
        var events = await _workItemService.GetActivityAsync(id, cancellationToken);
        return events is null ? NotFoundProblem($"Work item '{id}' was not found.") : Ok(events);
    }

    /// <summary>Returns oldest-first comments with safe author summaries.</summary>
    [HttpGet("{id:guid}/comments")]
    [ProducesResponseType(typeof(IReadOnlyList<CommentResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<CommentResponse>>> GetComments(Guid id, CancellationToken cancellationToken)
    {
        var comments = await _workItemService.GetCommentsAsync(id, cancellationToken);
        return comments is null ? NotFoundProblem($"Work item '{id}' was not found.") : Ok(comments);
    }

    /// <summary>Adds a comment and its activity event without changing the work item version.</summary>
    [HttpPost("{id:guid}/comments")]
    [ProducesResponseType(typeof(CommentResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CommentResponse>> AddComment(Guid id, [FromBody] CreateCommentRequest request, CancellationToken cancellationToken)
    {
        var comment = await _workItemService.AddCommentAsync(id, request, cancellationToken);
        return comment is null ? NotFoundProblem($"Work item '{id}' was not found.")
            : CreatedAtAction(nameof(GetComments), new { id }, comment);
    }

    private ObjectResult NotFoundProblem(string detail) =>
        Problem(statusCode: StatusCodes.Status404NotFound, title: "Resource Not Found", detail: detail, instance: HttpContext.Request.Path);
}
