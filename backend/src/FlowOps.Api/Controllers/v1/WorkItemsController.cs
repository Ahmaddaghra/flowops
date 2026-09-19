using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace FlowOps.Api.Controllers.v1;

[ApiController]
[Route("api/v1/work-items")]
[Produces("application/json")]
public class WorkItemsController : ControllerBase
{
    private readonly IWorkItemService _workItemService;

    public WorkItemsController(IWorkItemService workItemService)
    {
        _workItemService = workItemService ?? throw new ArgumentNullException(nameof(workItemService));
    }

    /// <summary>
    /// Retrieves all work items.
    /// </summary>
    /// <returns>A list of work items.</returns>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<WorkItemResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IEnumerable<WorkItemResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var items = await _workItemService.GetAllAsync(cancellationToken);
        return Ok(items);
    }

    /// <summary>
    /// Retrieves a work item by its unique ID.
    /// </summary>
    /// <param name="id">The unique identifier of the work item.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The requested work item.</returns>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(WorkItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<WorkItemResponse>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var item = await _workItemService.GetByIdAsync(id, cancellationToken);
        if (item == null)
        {
            return NotFound(new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Work Item Not Found",
                Detail = $"Work item with ID '{id}' was not found.",
                Instance = HttpContext.Request.Path
            });
        }

        return Ok(item);
    }

    /// <summary>
    /// Creates a new work item.
    /// </summary>
    /// <param name="request">The work item creation request payload.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The created work item.</returns>
    [HttpPost]
    [ProducesResponseType(typeof(WorkItemResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<WorkItemResponse>> Create(
        [FromBody] CreateWorkItemRequest request,
        CancellationToken cancellationToken)
    {
        var item = await _workItemService.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }
}
