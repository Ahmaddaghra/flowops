# Phase 1 — Backend Foundation

## Objective

Establish a clean, portfolio-grade ASP.NET Core backend foundation for FlowOps. This includes a layered architecture (Api, Application, Domain, Infrastructure), PostgreSQL persistence via Entity Framework Core, full server-side validation, Swagger/OpenAPI documentation, health check endpoint, xUnit unit tests, and local developer setup instructions.

## Scope

- **Implemented:**
  - `FlowOps.Domain`: Domain entity `WorkItem`, enums (`WorkItemStatus`, `WorkItemPriority`), and value invariants.
  - `FlowOps.Application`: DTOs (`CreateWorkItemRequest`, `WorkItemResponse`), interface contracts (`IWorkItemService`, `IFlowOpsDbContext`), and use case implementation (`WorkItemService`).
  - `FlowOps.Infrastructure`: EF Core `FlowOpsDbContext`, `WorkItemConfiguration`, database migrations (`InitialCreate`), and Npgsql PostgreSQL provider integration.
  - `FlowOps.Api`: ASP.NET Core 10 Web API, versioned controllers (`/api/v1/health`, `/api/v1/work-items`), `GlobalExceptionHandler` middleware returning RFC 7807 `ProblemDetails`, and Swagger/OpenAPI configuration.
  - `FlowOps.UnitTests`: 15 xUnit unit tests covering domain rules, validation failures, UTC timestamps, and service behavior.
  - Local database infrastructure: `docker-compose.yml` for containerized PostgreSQL, plus support for local PostgreSQL instances.

- **Explicitly Excluded (Deferred to Future Phases):**
  - Frontend / React application (Phase 2)
  - Authentication / Authorization / JWT (Phase 4)
  - Comments and Activity History (Phase 4)
  - Dashboard analytics (Phase 5)

## Architecture Decisions

1. **Inward Dependency Layering:**
   - `FlowOps.Domain` has 0 external dependencies (pure C# domain rules).
   - `FlowOps.Application` depends on `FlowOps.Domain` and abstractions only (`IFlowOpsDbContext`).
   - `FlowOps.Infrastructure` implements `IFlowOpsDbContext` and database configurations using EF Core & Npgsql.
   - `FlowOps.Api` handles HTTP transport, middleware, DI composition, and Swagger presentation.

2. **No Speculative Complexity:**
   - Avoided CQRS/MediatR, service buses, or generic repository boilerplate for Phase 1.
   - Used boring, readable, maintainable C# async code.

3. **UTC Timestamps & Invariant Enforcement:**
   - All timestamps (`CreatedAtUtc`, `UpdatedAtUtc`) are explicitly UTC.
   - Required fields and character length limits are enforced at both Domain and DTO levels.

4. **Structured Error Handling:**
   - Replaced scattered `try/catch` with `GlobalExceptionHandler` converting domain exceptions and validation errors into standard RFC 7807 `ProblemDetails` payloads.

## Technologies Used

- **Framework:** .NET 10.0 (ASP.NET Core Web API)
- **OR/M & Database:** Entity Framework Core 9.0.4 with `Npgsql.EntityFrameworkCore.PostgreSQL` 9.0.4 & PostgreSQL 17
- **API Documentation:** Swashbuckle ASP.NET Core 7.3.1 (Swagger UI at `/swagger`)
- **Testing:** xUnit 2.9.3, Moq 4.20.72, EF Core InMemory 9.0.4

## Implemented Endpoints

| Method | Endpoint | Description | Status Codes |
|---|---|---|---|
| `GET` | `/api/v1/health` | Health check endpoint returning status and DB connectivity | `200 OK`, `503 Service Unavailable` |
| `GET` | `/api/v1/work-items` | Lists all work items ordered by `CreatedAtUtc` descending | `200 OK` |
| `GET` | `/api/v1/work-items/{id}` | Gets a specific work item by Guid ID | `200 OK`, `404 Not Found` |
| `POST` | `/api/v1/work-items` | Creates a new work item with validation | `201 Created`, `400 Bad Request` |

## Data Model

### `WorkItem` Entity
- `Id` (`Guid`): Primary key.
- `Title` (`string`): Required, trimmed, max 200 characters.
- `Description` (`string?`): Optional, max 4000 characters.
- `Status` (`WorkItemStatus`): Enum (`Todo`, `InProgress`, `Blocked`, `Done`), stored as string, default `Todo`.
- `Priority` (`WorkItemPriority`): Enum (`Low`, `Medium`, `High`, `Critical`), stored as string.
- `AssigneeName` (`string?`): Optional, trimmed, max 100 characters.
- `CreatedAtUtc` (`DateTime`): UTC timestamp of creation.
- `UpdatedAtUtc` (`DateTime`): UTC timestamp of last modification.

## Validation Rules

- **Title:** Required, non-whitespace, trimmed, maximum 200 characters.
- **Description:** Maximum 4000 characters.
- **AssigneeName:** Trimmed, maximum 100 characters.
- **Priority / Status:** Invalid enum string values return a structured `400 Bad Request` `ProblemDetails` response.

## Testing Performed

- Executed 15 xUnit unit tests verifying:
  - WorkItem domain constructor initialization and invariant enforcement.
  - Domain validation error messages on null/empty/overly long strings.
  - Status and Priority transition behavior.
  - Application `WorkItemService` create, get all, and get by ID behavior.
  - Invalid input handling and error mapping.
- All 15 tests passed with 0 failures and 0 warnings.

## Commands Executed

```bash
# Environment exports (macOS with brew dotnet)
export DOTNET_ROOT="/opt/homebrew/opt/dotnet/libexec"
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/dotnet/libexec:~/.dotnet/tools:$PATH"

# Build solution
cd backend
dotnet restore
dotnet build

# Run xUnit unit tests
dotnet test

# Create and apply database migration
dotnet ef migrations add InitialCreate --project src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj --startup-project src/FlowOps.Api/FlowOps.Api.csproj
dotnet ef database update --project src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj --startup-project src/FlowOps.Api/FlowOps.Api.csproj

# Start API
dotnet run --project src/FlowOps.Api/FlowOps.Api.csproj
```

## Known Limitations

- No authentication/authorization is implemented yet (planned for Phase 4).
- Pagination and complex search filtering are deferred to Phase 3.

## Final Status

**Complete & Verified (Phase 1 Gate Passed).**
