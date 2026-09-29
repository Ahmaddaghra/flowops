using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Authorization;
using FlowOps.Application.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FlowOps.Api.Controllers.v1;

[Authorize(Roles = AppRoles.Admin + "," + AppRoles.Member)]
[ApiController]
[Route("api/v1/categories")]
public class CategoriesController : ControllerBase
{
    private readonly IWorkItemService _workItemService;

    public CategoriesController(IWorkItemService workItemService)
    {
        _workItemService = workItemService ?? throw new ArgumentNullException(nameof(workItemService));
    }

    /// <summary>Lists active categories available for new assignments.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<CategoryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CategoryResponse>>> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await _workItemService.GetCategoriesAsync(cancellationToken));
    }
}
