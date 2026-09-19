# FlowOps

A full-stack operations and support workflow platform built to demonstrate clean application architecture, API design, responsive UI, testing, and collaborative engineering practices.

FlowOps helps small teams create, assign, prioritize, track, and audit work items from intake to resolution. The project is intentionally scoped as a production-style portfolio application rather than a tutorial clone.

## Current Project Status

- **Phase 1 — Backend Foundation (Completed & Verified)**
- **Phase 2 — Frontend Foundation & Design System (Completed & Verified)**

### Tech Stack Summary

#### Backend
- **Framework:** ASP.NET Core 10 Web API (.NET 10.0.401 SDK / 10.0.12 runtime)
- **Persistence:** Entity Framework Core 10.0.12 + PostgreSQL 17 (via `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.3)
- **API Tooling:** OpenAPI / Swagger UI (Swashbuckle 7.3.1, enabled in Development)
- **Testing:** xUnit 2.9.3, Moq 4.20.72 (16 isolated unit tests, 0 EF Core test dependencies)
- **CI / Automation:** GitHub Actions (`.github/workflows/backend-ci.yml`)
- **Infrastructure:** Docker Compose (PostgreSQL 17-alpine with non-superuser role isolation)

#### Frontend
- **Framework:** React 19 (`react`, `react-dom`)
- **Language:** TypeScript 5 (Strict compiler options, explicit typing throughout)
- **Bundler & Tooling:** Vite 6 with `@vitejs/plugin-react`
- **Routing:** React Router DOM 7
- **Styling:** Tailwind CSS 3 with PostCSS and Autoprefixer
- **Icons:** Lucide React (`lucide-react`)
- **Class Merging:** `clsx` + `tailwind-merge`
- **Linting & Code Quality:** ESLint 9 (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`)
- **Formatting:** Prettier (`.prettierrc`)
- **CI / Automation:** GitHub Actions (`.github/workflows/frontend-ci.yml`)

---

## Architectural Boundaries

### Backend
FlowOps strictly follows an inward-pointing dependency architecture:

```text
FlowOps.Domain (Zero external dependencies)
      ↑
FlowOps.Application (Depends on Domain only; defines IWorkItemStore abstraction; NO EF Core)
      ↑
FlowOps.Infrastructure (Implements IWorkItemStore via EF Core 10 & PostgreSQL 17)
      ↑
FlowOps.Api (Web API controllers, RFC 7807 ProblemDetails middleware, Swagger in Development)

FlowOps.UnitTests (References Domain and Application only; mocks persistence via Moq)
```

### Frontend
The frontend follows a modular, feature-based architecture with clean separation of concerns:

```text
src/
├── app/               # Application bootstrap & router initialization
├── components/        # Layout shells and reusable UI primitives (Design System)
├── features/          # Domain-specific modules (Work Items table, card, badges, pages)
├── lib/               # Typed API client, RFC 7807 error handling & utility functions
├── pages/             # General application views (Settings, Dashboard preview, 404)
├── routes/            # Route declarations and navigation mapping
└── types/             # Domain and API response contracts
```

---

## Continuous Integration

FlowOps uses GitHub Actions for automated quality gates on every push and pull request targeting `main`:

### Backend CI (`.github/workflows/backend-ci.yml`)
- **Restore:** Restores solution dependencies (`dotnet restore`).
- **Formatting Verification:** Enforces C# style rules and fails on violations (`dotnet format --verify-no-changes --no-restore`).
- **Build:** Compiles all projects (`dotnet build --no-restore`).
- **Unit Tests:** Executes isolated unit tests (`dotnet test --no-build`).

### Frontend CI (`.github/workflows/frontend-ci.yml`)
- **Install:** Installs deterministic dependencies via `npm ci`.
- **Formatting Verification:** Verifies formatting against Prettier (`npm run format:check`).
- **Linting:** Runs ESLint rules (`npm run lint`).
- **Build:** Compiles TypeScript and builds production bundle (`npm run build`).

---

## Configuration & Secret Hygiene Model

- **`appsettings.json` (Production Baseline):**
  Contains production-safe baseline defaults only. Contains **no** database passwords, credentials, or local connection strings (`ConnectionStrings:DefaultConnection` is empty).
- **`appsettings.Development.json` (Local Development):**
  Contains disposable container-only defaults for zero-friction local development. These are strictly local non-production values.
- **Frontend `.env.example`:**
  Defines `VITE_API_BASE_URL` (defaults to `/api/v1` with Vite dev proxy forwarding to `http://localhost:5055`).
- **`.env`:**
  Ignored by git and untracked.

---

## Implemented vs Planned Features

### Implemented (Phase 1 & Phase 2)
- [x] Layered ASP.NET Core backend solution (`Domain`, `Application`, `Infrastructure`, `Api`)
- [x] Core `WorkItem` domain entity with rich validation and strict UTC invariants
- [x] Use-case oriented persistence abstraction (`IWorkItemStore`) in Application layer
- [x] EF Core PostgreSQL persistence, fluent mappings, and initial migration
- [x] Hardened PostgreSQL role configuration (non-superuser application user)
- [x] Versioned REST API (`/api/v1/health`, `/api/v1/work-items`)
- [x] Centralized RFC 7807 `ProblemDetails` exception handling with no stack trace leakage
- [x] Interactive Swagger UI documentation at `/swagger` (Development environment)
- [x] 16 decoupled xUnit unit tests covering domain invariants and application services
- [x] GitHub Actions automated backend CI workflow (restore, format check, build, test)
- [x] React 19 + TypeScript 5 + Vite 6 frontend application shell
- [x] Tailwind CSS restrained B2B operations design system & responsive layout (desktop & mobile)
- [x] Reusable UI primitives (`Button`, `Badge`, `Card`, `Table`, `Skeleton`, `EmptyState`, `ErrorState`, `PageHeader`, `Input`, `Select`, `Modal`)
- [x] Typed API client with automatic RFC 7807 `ProblemDetails` error extraction
- [x] Work items list view (high-density table for desktop, cards for mobile)
- [x] Read-only work item detail view with ID copying
- [x] Create work item modal with live validation & backend error handling
- [x] Resilient loading skeletons, empty states, and retryable error handling
- [x] Frontend CI workflow (ESLint, Prettier, TypeScript compilation, Vite build)

### Planned (Future Phases)
- [ ] Work item edit, status transitions & workflow auditing (Phase 3)
- [ ] Work item search, filtering & pagination (Phase 3)
- [ ] JWT authentication, user identity & work item comments (Phase 4)
- [ ] Workload summary dashboard & metrics (Phase 5)

---

## Local Setup & Quick Start

### 1. Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/) (Version 10.0.401 or compatible)
- [Node.js](https://nodejs.org/) (Version 20+ or 22 LTS recommended) and `npm`
- [Docker Desktop](https://www.docker.com/) or local [PostgreSQL 17](https://www.postgresql.org/)

### 2. Database Setup

Copy the example environment configuration and start the containerized PostgreSQL 17 database:

```bash
cp .env.example .env
docker compose up -d
```

### 3. Backend Setup & Run

Apply database migrations and launch the backend API:

```bash
# Apply migrations
dotnet ef database update \
  --project backend/src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj \
  --startup-project backend/src/FlowOps.Api/FlowOps.Api.csproj

# Run API server on port 5055
ASPNETCORE_ENVIRONMENT=Development \
dotnet run \
  --project backend/src/FlowOps.Api/FlowOps.Api.csproj \
  --no-launch-profile \
  --urls http://localhost:5055
```

The API will be available at:
- **Health Check:** `http://localhost:5055/api/v1/health`
- **Swagger UI:** `http://localhost:5055/swagger`

### 4. Frontend Setup & Run

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The web application will be running at `http://localhost:5173`.
All requests to `/api/v1` are automatically proxied to the backend on `http://localhost:5055`.

### 5. Frontend Scripts

```bash
# Run development server
npm run dev

# Run TypeScript type check and build production bundle
npm run build

# Run ESLint check
npm run lint

# Check formatting with Prettier
npm run format:check

# Auto-format with Prettier
npm run format
```

---

## Repository Structure

```text
flowops/
├── .github/
│   └── workflows/
│       ├── backend-ci.yml           # GitHub Actions backend CI workflow
│       └── frontend-ci.yml          # GitHub Actions frontend CI workflow
├── backend/                         # ASP.NET Core 10 Web API
│   ├── FlowOps.sln                  # Solution file
│   ├── src/
│   │   ├── FlowOps.Domain/          # Pure domain entities, value invariants & enums
│   │   ├── FlowOps.Application/     # DTOs, use case services & IWorkItemStore contract
│   │   ├── FlowOps.Infrastructure/  # EF Core 10 DbContext, WorkItemStore & PostgreSQL mappings
│   │   └── FlowOps.Api/             # Controllers, ProblemDetails middleware & Swagger
│   └── tests/
│       └── FlowOps.UnitTests/       # xUnit unit tests (isolated, Moq-based)
├── frontend/                        # React 19 + TypeScript 5 + Vite 6 client
│   ├── src/
│   │   ├── app/                     # App entry and router initialization
│   │   ├── components/              # Layout and design system primitives
│   │   ├── features/                # Feature-sliced modules (work-items)
│   │   ├── lib/                     # Typed API client & utilities
│   │   ├── pages/                   # Application pages
│   │   ├── routes/                  # Route configuration
│   │   └── types/                   # TypeScript interfaces & API errors
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── docker/
│   └── postgres/
│       └── init-db.sh               # Non-superuser role initialization script
├── docs/
│   ├── PROJECT_PLAN.md              # Phases, gates, and definition of done
│   ├── ARCHITECTURE.md              # Architecture and domain boundaries
│   ├── DATA_MODEL.md                # Initial entities and relationships
│   ├── API_DESIGN.md                # REST conventions and endpoint plan
│   └── phases/
│       ├── phase-1-backend-foundation.md # Phase 1 documentation
│       └── phase-2-frontend-foundation.md # Phase 2 documentation
├── docker-compose.yml               # Hardened local PostgreSQL container configuration
├── .env.example                     # Local development environment template
├── CONTRIBUTING.md
└── LICENSE
```

---

## License

MIT.
