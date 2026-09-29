using FlowOps.Application.DTOs;
using FlowOps.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FlowOps.Api.Controllers.v1;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(IIdentityService identityService, ITokenService tokenService, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>Registers a Member account and issues an access token.</summary>
    [AllowAnonymous]
    [HttpPost("register")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        var result = await identityService.RegisterAsync(request, cancellationToken);
        if (!result.Succeeded)
        {
            return ValidationProblem(new ValidationProblemDetails(result.Errors.ToDictionary(pair => pair.Key, pair => pair.Value)));
        }

        return CreatedAtAction(nameof(Me), tokenService.CreateToken(result.Value!));
    }

    /// <summary>Signs in using email and password.</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await identityService.LoginAsync(request, cancellationToken);
        return user is null
            ? Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Authentication Failed", detail: "Invalid email or password.")
            : Ok(tokenService.CreateToken(user));
    }

    /// <summary>Returns the authenticated user's safe account details.</summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType(typeof(AuthUserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthUserResponse>> Me(CancellationToken cancellationToken)
    {
        var user = currentUser.UserId is { } userId ? await identityService.GetUserAsync(userId, cancellationToken) : null;
        return user is null
            ? Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Unauthorized", detail: "A valid access token is required.")
            : Ok(user);
    }
}
