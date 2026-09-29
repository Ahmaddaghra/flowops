using System;
using FlowOps.Domain.Exceptions;
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

        if (exception is ArgumentException argumentException)
        {
            var errors = new Dictionary<string, string[]>
            {
                [string.IsNullOrWhiteSpace(argumentException.ParamName) ? "request" : argumentException.ParamName] = [argumentException.Message]
            };
            var validation = new ValidationProblemDetails(errors)
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "One or more validation errors occurred.",
                Instance = httpContext.Request.Path
            };
            validation.Extensions["traceId"] = httpContext.TraceIdentifier;
            httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
            httpContext.Response.ContentType = "application/problem+json";
            await httpContext.Response.WriteAsJsonAsync(validation, options: null, contentType: "application/problem+json", cancellationToken: cancellationToken);
            return true;
        }

        var (statusCode, title, detail) = exception switch
        {
            InvalidWorkItemTransitionException transition => (
                StatusCodes.Status409Conflict,
                "Invalid Work Item Transition",
                transition.Message
            ),
            KeyNotFoundException notFound => (
                StatusCodes.Status404NotFound,
                "Resource Not Found",
                notFound.Message
            ),
            BadHttpRequestException badRequest => (
                StatusCodes.Status400BadRequest,
                "Invalid Request",
                badRequest.Message
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

        await httpContext.Response.WriteAsJsonAsync(problemDetails, options: null, contentType: "application/problem+json", cancellationToken: cancellationToken);

        return true;
    }
}
