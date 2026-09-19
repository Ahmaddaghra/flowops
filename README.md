# FlowOps

A full-stack operations and support workflow platform built to demonstrate clean application architecture, API design, responsive UI, testing, and collaborative engineering practices.

FlowOps helps small teams create, assign, prioritize, track, and audit work items from intake to resolution. The project is intentionally scoped as a production-style portfolio application rather than a tutorial clone.

## Current Project Status

**Phase 1 — Backend Foundation (Remediated & Verified)**

The backend API baseline is fully implemented, configured with EF Core 10 + PostgreSQL 17, documented with Swagger/OpenAPI, and covered by decoupled xUnit unit tests.

### Stack Summary

- **Backend Framework:** ASP.NET Core 10 Web API (.NET 10.0.401 SDK / 10.0.12 runtime)
- **Persistence:** Entity Framework Core 10.0.12 + PostgreSQL 17 (via `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.3)
- **API Tooling:** OpenAPI / Swagger UI (Swashbuckle 7.3.1)
- **Testing:** xUnit 2.9.3, Moq 4.20.72 (16 isolated unit tests, 0 EF Core test dependencies)
- **Infrastructure:** Docker Compose (PostgreSQL 17-alpine with non-superuser role isolation)

---

## Architectural Boundaries

FlowOps strictly follows an inward-pointing dependency architecture:

```text
FlowOps.Domain (Zero external dependencies)
      ↑
FlowOps.Application (Depends on Domain only; defines IWorkItemStore abstraction; NO EF Core)
      ↑
FlowOps.Infrastructure (Implements IWorkItemStore via EF Core 10 & PostgreSQL 17)
      ↑
FlowOps.Api (Web API controllers, RFC 7807 ProblemDetails middleware, Swagger)

FlowOps.UnitTests (References Domain and Application only; mocks persistence via Moq)
```

---

## Implemented vs Planned Features

### Implemented (Phase 1)
- [x] Layered ASP.NET Core backend solution (`Domain`, `Application`, `Infrastructure`, `Api`)
- [x] Core `WorkItem` domain entity with rich validation and strict UTC invariants
- [x] Use-case oriented persistence abstraction (`IWorkItemStore`) in Application layer
- [x] EF Core PostgreSQL persistence, fluent mappings, and initial migration
- [x] Hardened PostgreSQL role configuration (non-superuser application user)
- [x] Versioned REST API (`/api/v1/health`, `/api/v1/work-items`)
- [x] Centralized RFC 7807 `ProblemDetails` exception handling with no stack trace leakage
- [x] Interactive Swagger UI documentation at `/swagger`
- [x] 16 decoupled xUnit unit tests covering domain invariants and application services
- [x] Local PostgreSQL environment via Docker Compose with `.env.example`

### Planned (Future Phases)
- [ ] React + TypeScript + Vite frontend shell (Phase 2)
- [ ] Tailwind CSS design system & responsive layout (Phase 2)
- [ ] Work item edit, status workflow, search & pagination (Phase 3)
- [ ] JWT authentication, user roles & work item comments (Phase 4)
- [ ] Workload summary dashboard & metrics (Phase 5)

---

## Local Setup & Quick Start

The following canonical flow starts from the repository root:

### 1. Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/) (Version 10.0.401 or compatible)
- [Docker Desktop](https://www.docker.com/) or local [PostgreSQL 17](https://www.postgresql.org/)

### 2. Environment Configuration & Database Setup

Copy the example environment configuration:

```bash
cp .env.example .env
```

Start the containerized PostgreSQL 17 database:

```bash
docker compose up -d
```

*Note: The container uses an initialization script (`docker/postgres/init-db.sh`) ensuring the application database user (`flowops`) is NOT a PostgreSQL superuser and owns only its dedicated database.*

### 3. Restore, Build & Run Unit Tests

From the repository root:

```bash
cd backend
dotnet restore
dotnet build
dotnet test
```

### 4. Apply Database Migrations

Apply pending migrations to the local database:

```bash
dotnet ef database update \
  --project src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj \
  --startup-project src/FlowOps.Api/FlowOps.Api.csproj
```

*(If `dotnet-ef` is not in your shell PATH, ensure `export PATH="$HOME/.dotnet/tools:$PATH"` and set `export DOTNET_ROOT="/opt/homebrew/opt/dotnet/libexec"` if using Homebrew .NET).*

### 5. Start API Server

Run the API on the deterministic development port (`5055`):

```bash
dotnet run \
  --project src/FlowOps.Api/FlowOps.Api.csproj \
  --no-launch-profile \
  --urls http://localhost:5055
```

The API will be available at:
- **Base API:** `http://localhost:5055/api/v1`
- **Swagger UI:** `http://localhost:5055/swagger`
- **OpenAPI JSON:** `http://localhost:5055/swagger/v1/swagger.json`
- **Health Check:** `http://localhost:5055/api/v1/health`

---

## Example API Usage (cURL)

All examples target the canonical local development URL `http://localhost:5055`:

### Health Check
```bash
curl -i http://localhost:5055/api/v1/health
```

### Create Work Item
```bash
curl -i -X POST http://localhost:5055/api/v1/work-items \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Configure production monitoring",
    "description": "Set up alerts for API error rates and latency",
    "priority": "High",
    "assigneeName": "Ahmad Daghra"
  }'
```

### List All Work Items
```bash
curl -i http://localhost:5055/api/v1/work-items
```

### Get Work Item by ID
```bash
curl -i http://localhost:5055/api/v1/work-items/{id}
```

### Error Handling Verification (Invalid Priority -> 400 Bad Request)
```bash
curl -i -X POST http://localhost:5055/api/v1/work-items \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Title", "priority": "SuperUrgent"}'
```

---

## Repository Structure

```text
flowops/
├── backend/                         # ASP.NET Core 10 Web API
│   ├── FlowOps.sln                  # Solution file
│   ├── src/
│   │   ├── FlowOps.Domain/          # Pure domain entities, value invariants & enums
│   │   ├── FlowOps.Application/     # DTOs, use case services & IWorkItemStore contract
│   │   ├── FlowOps.Infrastructure/  # EF Core 10 DbContext, WorkItemStore & PostgreSQL mappings
│   │   └── FlowOps.Api/             # Controllers, ProblemDetails middleware & Swagger
│   └── tests/
│       └── FlowOps.UnitTests/       # xUnit unit tests (isolated, Moq-based)
├── frontend/                        # React client (Phase 2+)
├── docker/
│   └── postgres/
│       └── init-db.sh               # Non-superuser role initialization script
├── docs/
│   ├── PROJECT_PLAN.md              # Phases, gates, and definition of done
│   ├── ARCHITECTURE.md              # Architecture and domain boundaries
│   ├── DATA_MODEL.md                # Initial entities and relationships
│   ├── API_DESIGN.md                # REST conventions and endpoint plan
│   └── phases/
│       └── phase-1-backend-foundation.md # Phase 1 technical remediation documentation
├── docker-compose.yml               # Hardened local PostgreSQL container configuration
├── .env.example                     # Local development environment template
├── CONTRIBUTING.md
└── LICENSE
```

---

## License

MIT.
