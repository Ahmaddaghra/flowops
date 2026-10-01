using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FlowOps.Api.Controllers.v1;

[ApiController]
[Authorize]
[Route("api/v1/users")]
public sealed class UsersController(IUserDirectory userDirectory) : ControllerBase
{
    /// <summary>Lists active users' safe assignment summaries.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<UserSummaryResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<IReadOnlyList<UserSummaryResponse>>> List(CancellationToken cancellationToken) =>
        Ok(await userDirectory.ListAsync(cancellationToken));
}
