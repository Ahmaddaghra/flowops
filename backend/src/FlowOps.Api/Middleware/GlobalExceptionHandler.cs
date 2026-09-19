using System;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FlowOps.Api.Middleware;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;
    private readonly IHostEnvironment _env;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IHostEnvironment env)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _env = env ?? throw new ArgumentNullException(nameof(env));
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "An unhandled exception occurred while processing the request: {Message}", exception.Message);

        var (statusCode, title, detail) = exception switch
        {
            ArgumentException argEx => (
                StatusCodes.Status400BadRequest,
                "Bad Request",
                argEx.Message
            ),
            FormatException formatEx => (
                StatusCodes.Status400BadRequest,
                "Invalid Payload Format",
                formatEx.Message
            ),
            KeyNotFoundException notFoundEx => (
                StatusCodes.Status404NotFound,
                "Resource Not Found",
                notFoundEx.Message
            ),
            _ => (
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred",
                _env.IsDevelopment() ? exception.Message : "An unexpected server error occurred. Please try again later."
            )
        };

        var problemDetails = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Instance = httpContext.Request.Path
        };

        problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = statusCode;
        httpContext.Response.ContentType = "application/problem+json";

        await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);

        return true;
    }
}
