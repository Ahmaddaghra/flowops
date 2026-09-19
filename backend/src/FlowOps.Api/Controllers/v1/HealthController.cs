using System;
using System.Threading;
using System.Threading.Tasks;
using FlowOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace FlowOps.Api.Controllers.v1;

[ApiController]
[Route("api/v1/[controller]")]
public class HealthController : ControllerBase
{
    private readonly FlowOpsDbContext _dbContext;

    public HealthController(FlowOpsDbContext dbContext)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
    }

    /// <summary>
    /// Checks system and database health status.
    /// </summary>
    /// <returns>System health object.</returns>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> GetHealth(CancellationToken cancellationToken)
    {
        var dbCanConnect = await _dbContext.Database.CanConnectAsync(cancellationToken);

        if (!dbCanConnect)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                status = "Unhealthy",
                database = "Unavailable"
            });
        }

        return Ok(new
        {
            status = "Healthy"
        });
    }
}
