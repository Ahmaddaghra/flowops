# FlowOps

A full-stack operations and support workflow platform built to demonstrate clean application architecture, API design, responsive UI, testing, and collaborative engineering practices.

FlowOps helps small teams create, assign, prioritize, track, and audit work items from intake to resolution. The project is intentionally scoped as a production-style portfolio application rather than a tutorial clone.

## Current Project Status

**Phase 1 — Backend Foundation (Completed)**

The backend API baseline is fully implemented, configured with EF Core + PostgreSQL, documented with Swagger/OpenAPI, and covered by xUnit unit tests.

### Stack Summary

- **Backend:** ASP.NET Core 10 Web API (C#)
- **Persistence:** Entity Framework Core 9.0.4 + PostgreSQL 17 (Npgsql)
- **API Tooling:** OpenAPI / Swagger UI (Swashbuckle)
- **Testing:** xUnit 2.9.3, Moq, EF Core InMemory
- **Infrastructure:** Docker Compose (PostgreSQL 17)

---

## Implemented vs Planned Features

### Implemented (Phase 1)
- [x] Layered ASP.NET Core backend solution (`Domain`, `Application`, `Infrastructure`, `Api`)
- [x] Core `WorkItem` domain entity with validation and UTC invariants
- [x] EF Core PostgreSQL persistence, fluent mappings, and initial migration
- [x] Versioned REST API (`/api/v1/health`, `/api/v1/work-items`)
- [x] Centralized RFC 7807 `ProblemDetails` exception handling
- [x] Interactive Swagger UI documentation at `/swagger`
- [x] 15 xUnit unit tests covering domain and application logic
- [x] Local PostgreSQL environment via Docker Compose

### Planned (Future Phases)
- [ ] React + TypeScript + Vite frontend shell (Phase 2)
- [ ] Tailwind CSS design system & responsive layout (Phase 2)
- [ ] Work item edit, status workflow, search & pagination (Phase 3)
- [ ] JWT authentication, user roles & work item comments (Phase 4)
- [ ] Workload summary dashboard & metrics (Phase 5)

---

## Local Setup & Quick Start

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/)
- [PostgreSQL 17](https://www.postgresql.org/) or [Docker Desktop](https://www.docker.com/)

### 1. Clone & Set Up Database

Start local PostgreSQL using Docker Compose:

```bash
docker compose up -d
```

*Or use a local PostgreSQL server with connection string in `appsettings.json` / `ConnectionStrings__DefaultConnection` environment variable.*

### 2. Restore & Build Backend

```bash
cd backend
dotnet restore
dotnet build
```

### 3. Run Database Migrations

```bash
dotnet ef database update --project src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj --startup-project src/FlowOps.Api/FlowOps.Api.csproj
```

### 4. Run Automated Tests

```bash
dotnet test
```

### 5. Start API Server

```bash
dotnet run --project src/FlowOps.Api/FlowOps.Api.csproj
```

The API will be available at:
- **Base API:** `http://localhost:5000/api/v1` or `https://localhost:5001/api/v1`
- **Swagger UI:** `http://localhost:5000/swagger` or `https://localhost:5001/swagger`
- **Health Check:** `http://localhost:5000/api/v1/health`

---

## Repository Structure

```text
flowops/
├── backend/                  # ASP.NET Core 10 Web API
│   ├── FlowOps.sln           # Solution file
│   ├── src/
│   │   ├── FlowOps.Domain/          # Domain entities & enums
│   │   ├── FlowOps.Application/     # DTOs, interfaces & use cases
│   │   ├── FlowOps.Infrastructure/  # EF Core DbContext & PostgreSQL configuration
│   │   └── FlowOps.Api/             # Web API controllers & Swagger setup
│   └── tests/
│       └── FlowOps.UnitTests/       # xUnit unit tests
├── frontend/                 # React client (Phase 2+)
├── docs/
│   ├── PROJECT_PLAN.md       # Phases, gates, and definition of done
│   ├── ARCHITECTURE.md       # Architecture and domain boundaries
│   ├── DATA_MODEL.md         # Initial entities and relationships
│   ├── API_DESIGN.md         # REST conventions and endpoint plan
│   └── phases/
│       └── phase-1-backend-foundation.md # Phase 1 technical documentation
├── docker-compose.yml        # Local PostgreSQL container configuration
├── CONTRIBUTING.md
└── LICENSE
```

---

## Engineering Principles

1. Every feature starts from a clear requirement and acceptance criteria.
2. Business rules stay out of UI components and controllers.
3. API behavior is documented and testable.
4. Database migrations are reviewed and reproducible.
5. Pull requests stay small enough to review.
6. A feature is not done until its happy path, validation, error states, and relevant tests are covered.

---

## License

MIT.
