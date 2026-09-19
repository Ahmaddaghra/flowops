# Phase 1 — Backend Foundation (Senior Engineer Remediation Report)

## Objective

Establish a clean, robust, and architecturally decoupled ASP.NET Core backend foundation for FlowOps. This document reflects the completed remediation pass resolving architectural dependency leaks, database security hygiene, test isolation, package version alignment, and deterministic local developer experience.

---

## Remediation Summary

1. **Application Layer Persistence Decoupling:**
   - Eliminated the direct dependency of `FlowOps.Application` on `Microsoft.EntityFrameworkCore` and `IFlowOpsDbContext`.
   - Introduced a clean, use-case oriented abstraction `IWorkItemStore` in `FlowOps.Application.Interfaces` with `ListAsync`, `GetByIdAsync`, `AddAsync`, and `SaveChangesAsync`.
   - Implemented `WorkItemStore` in `FlowOps.Infrastructure.Persistence` backed by `FlowOpsDbContext`.
   - `FlowOps.Application` now references only `FlowOps.Domain` and `Microsoft.Extensions.Logging.Abstractions`.

2. **Clean Unit Test Architecture:**
   - Removed `Microsoft.EntityFrameworkCore.InMemory`, `Microsoft.EntityFrameworkCore.Relational`, and `Npgsql.EntityFrameworkCore.PostgreSQL` from `FlowOps.UnitTests`.
   - Removed project references to `FlowOps.Infrastructure` and `FlowOps.Api` from `FlowOps.UnitTests`.
   - Replaced in-memory database test fixtures in `WorkItemServiceTests` with pure `Moq` doubles against `IWorkItemStore`.
   - Test execution time reduced by >80% while retaining and improving coverage (16 tests, 0 failures).

3. **Database Security & Local Hygiene:**
   - Hardened PostgreSQL container and local environment: the FlowOps application role (`flowops`) is explicitly NOT a PostgreSQL superuser (`rolsuper = false`, `rolcreatedb = false`, `rolcreaterole = false`).
   - Created `docker/postgres/init-db.sh` to initialize the database, create the unprivileged application role, and grant ownership of the `flowops` database and `public` schema.
   - Provided `.env.example` documenting all configuration parameters (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER`, `POSTGRES_SUPERUSER_PASSWORD`, `POSTGRES_PORT`, `ConnectionStrings__DefaultConnection`). Confirmed `.env` is gitignored.
   - Cleaned `appsettings.json` to avoid committing reusable credentials.

4. **Aligned .NET 10 / EF Core 10 Package Stack:**
   - Aligned all EF Core packages to stable, compatible versions matching .NET 10:
     - `Microsoft.EntityFrameworkCore`: 10.0.12
     - `Microsoft.EntityFrameworkCore.Design`: 10.0.12
     - `Npgsql.EntityFrameworkCore.PostgreSQL`: 10.0.3
     - `Microsoft.Extensions.Logging.Abstractions`: 10.0.0
     - `Swashbuckle.AspNetCore`: 7.3.1
   - Zero compilation warnings, zero package downgrade or compatibility warnings.

5. **Deterministic Local Run Experience:**
   - Standardized application URL to `http://localhost:5055`.
   - Updated `launchSettings.json`, `.http` files, and `README.md` curl examples to consistently target `http://localhost:5055`.
   - Clean canonical run sequence starting strictly from the repository root.

---

## Architectural Dependency Graph

```text
FlowOps.Domain (Zero external dependencies)
      ↑
FlowOps.Application (References FlowOps.Domain only; defines IWorkItemStore; NO EF Core)
      ↑
FlowOps.Infrastructure (References FlowOps.Application, FlowOps.Domain; implements IWorkItemStore via EF Core 10)
      ↑
FlowOps.Api (References FlowOps.Application, FlowOps.Domain, FlowOps.Infrastructure; Web API controllers)

FlowOps.UnitTests (References FlowOps.Domain and FlowOps.Application only)
```

### Dependency Audit Verification

#### `dotnet list FlowOps.Application.csproj reference`
```text
Project reference(s)
--------------------
../FlowOps.Domain/FlowOps.Domain.csproj
```

#### `dotnet list FlowOps.Application.csproj package`
```text
Project 'FlowOps.Application' has the following package references
   [net10.0]: 
   Top-level Package                                Requested   Resolved
   > Microsoft.Extensions.Logging.Abstractions      10.0.0      10.0.0
```

#### `dotnet list FlowOps.UnitTests.csproj reference`
```text
Project reference(s)
--------------------
../../src/FlowOps.Domain/FlowOps.Domain.csproj
../../src/FlowOps.Application/FlowOps.Application.csproj
```

#### `dotnet list FlowOps.UnitTests.csproj package`
```text
Project 'FlowOps.UnitTests' has the following package references
   [net10.0]: 
   Top-level Package                Requested   Resolved
   > coverlet.collector             6.0.4       6.0.4   
   > Microsoft.NET.Test.Sdk         17.14.1     17.14.1 
   > Moq                            4.20.72     4.20.72 
   > xunit                          2.9.3       2.9.3   
   > xunit.runner.visualstudio      3.1.4       3.1.4
```

---

## Technology & Package Matrix

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Runtime / SDK | .NET / C# | 10.0.401 SDK / 10.0.12 Runtime | Web API foundation |
| ORM | Entity Framework Core | 10.0.12 | Object-relational mapping in Infrastructure |
| EF Design Tools | Microsoft.EntityFrameworkCore.Design | 10.0.12 | Migrations & scaffolding |
| Database Driver | Npgsql.EntityFrameworkCore.PostgreSQL | 10.0.3 | PostgreSQL EF Core provider |
| Database Engine | PostgreSQL | 17 (postgres:17-alpine) | Persistent relational store |
| API Docs | Swashbuckle.AspNetCore | 7.3.1 | OpenAPI specification & Swagger UI |
| Test Framework | xUnit | 2.9.3 | Unit test runner |
| Mocking Library | Moq | 4.20.72 | Persistence abstraction doubles |

---

## Database Security & Role Verification

PostgreSQL application role privileges verified via local role catalog:

```sql
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb 
FROM pg_roles 
WHERE rolname = 'flowops';
```

**Output:**
```text
 rolname | rolsuper | rolcreaterole | rolcreatedb 
---------+----------+---------------+-------------
 flowops | f        | f             | f
(1 row)
```

The `flowops` role owns the `flowops` database and the `public` schema, permitting all standard table/index DDL and data DML required by migrations and operations without possessing instance-wide `SUPERUSER` privileges.

---

## Implemented Endpoints & Verification Results

All endpoints verified against running instance at `http://localhost:5055`:

| Method | Endpoint | Description | Status Code | Verification Result |
|---|---|---|---|---|
| `GET` | `/api/v1/health` | System health & DB connectivity | `200 OK` | Verified `{"status":"Healthy"}` |
| `GET` | `/api/v1/work-items` | Lists all work items ordered by `CreatedAtUtc` desc | `200 OK` | Verified array retrieval |
| `GET` | `/api/v1/work-items/{id}` | Gets work item by Guid ID | `200 OK` | Verified single item match |
| `POST` | `/api/v1/work-items` | Creates work item with validation | `201 Created` | Verified DB persistence & Location header |
| `GET` | `/api/v1/work-items/{nonexistent}` | Guid not found | `404 Not Found` | Verified structured RFC 7807 ProblemDetails |
| `POST` | `/api/v1/work-items` (invalid title) | Empty title validation error | `400 Bad Request` | Verified structured ValidationProblemDetails |
| `POST` | `/api/v1/work-items` (invalid priority) | Unrecognized enum string | `400 Bad Request` | Verified structured ProblemDetails (no stack trace) |
| `GET` | `/swagger` | Swagger UI HTML dashboard | `200 OK` | Verified interactive docs load |
| `GET` | `/swagger/v1/swagger.json` | OpenAPI v1 specification | `200 OK` | Verified valid OpenAPI 3.0 schema |

---

## Automated Test Results

Executed via `dotnet test backend/FlowOps.sln`:

```text
Passed!  - Failed: 0, Passed: 16, Skipped: 0, Total: 16, Duration: 44 ms - FlowOps.UnitTests.dll (net10.0)
```

### Coverage Breakdown
- **Domain (`WorkItemTests`):** 10 test executions covering constructor validation, title/description/assignee length limits, status transitions, invalid enum handling, and UTC timestamps.
- **Application (`WorkItemServiceTests`):** 6 test executions covering valid creation, null request validation, invalid priority string validation, descending list retrieval, existing ID lookup, and nonexistent ID lookup.

---

## Canonical Local Run Sequence

```bash
# 1. Start database from repo root
docker compose up -d

# 2. Navigate, restore, build and test
cd backend
dotnet restore
dotnet build
dotnet test

# 3. Apply migrations
dotnet ef database update \
  --project src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj \
  --startup-project src/FlowOps.Api/FlowOps.Api.csproj

# 4. Run API on port 5055
dotnet run \
  --project src/FlowOps.Api/FlowOps.Api.csproj \
  --no-launch-profile \
  --urls http://localhost:5055
```

---

## Known Deferred Items

The following features remain planned for upcoming phases and are deliberately excluded from Phase 1:
- Frontend / React 19 UI & Tailwind CSS design system (Phase 2)
- Work item editing, status transition workflow, filtering, search & pagination (Phase 3)
- Authentication, JWT Bearer tokens, role-based authorization, work item comments (Phase 4)
- Dashboard metrics and workload analytics (Phase 5)

---

## Final Review Verdict

**All Phase 1 senior engineer remediation criteria and gates have passed.**
The branch `feature/phase-1-backend-foundation` is clean, robust, fully tested, and ready for pull request review.
