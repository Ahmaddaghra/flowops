# FlowOps

A full-stack operations and support workflow platform built to demonstrate clean application architecture, API design, responsive UI, testing, and collaborative engineering practices.

FlowOps is being built to help small teams create, assign, prioritize, track, and audit work items from intake to resolution. The project is intentionally scoped as a production-style portfolio application rather than a tutorial clone.

## Current Project Status

- **Phase 1 — Backend Foundation (Completed & Verified)**
- **Phase 2 — Frontend Foundation & Design System (Completed & Verified)**
- **Phase 3 — Work Item Lifecycle (Completed & Verified)**
- **Phase 4 — Authentication, Collaboration & QA (In Progress; Stage 4D completed and verified)**

The reviewed Stage 4A/4B foundation provides Identity/JWT authentication and server-side work item authorization. Stage 4C adds the authenticated React shell, login/register, protected routes, and session handling. Stage 4D implements real user assignment and permission-aware work item controls using server capabilities; its automated and real-identity browser checks pass. Comments and expanded QA artifacts remain pending, and the Postman collection still needs its Phase 4 auth update. Stage 4E has not started.

### Tech Stack Summary

#### Backend
- **Framework:** ASP.NET Core 10 Web API (.NET 10.0.401 SDK / 10.0.12 runtime)
- **Persistence:** Entity Framework Core 10.0.12 + PostgreSQL 17 (via `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.3)
- **Identity:** ASP.NET Core Identity with GUID users and Admin/Member roles; JWT bearer access tokens
- **API Tooling:** OpenAPI / Swagger UI (Swashbuckle 7.3.1, enabled in Development)
- **Testing:** xUnit 2.9.3, Moq 4.20.72, and PostgreSQL-backed API integration tests
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
- **Component Tests:** Vitest 5 with React Testing Library
- **CI / Automation:** GitHub Actions (`.github/workflows/frontend-ci.yml`)

---

## Architectural Boundaries

### Backend
FlowOps strictly follows an inward-pointing dependency architecture:

```text
FlowOps.Domain (Zero external dependencies)
      ↑
FlowOps.Application (Domain, use cases, identity/current-user abstractions; NO EF Core or Identity)
      ↑
FlowOps.Infrastructure (EF Core/PostgreSQL, ASP.NET Identity, JWT issuance)
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
├── features/          # Authentication provider/routes/forms and Work Items views
├── lib/               # Typed API client, shared auth session, error handling & utilities
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
- **PostgreSQL Integration Tests:** Starts PostgreSQL 17 and runs API tests against an isolated schema.

### Frontend CI (`.github/workflows/frontend-ci.yml`)
- **Install:** Installs deterministic dependencies via `npm ci`.
- **Formatting Verification:** Verifies formatting against Prettier (`npm run format:check`).
- **Linting:** Runs ESLint rules (`npm run lint`).
- **Tests:** Runs frontend component and page tests (`npm run test -- --run`).
- **Build:** Compiles TypeScript and builds production bundle (`npm run build`).

---

## Configuration & Secret Hygiene Model

- **`appsettings.json` (Production Baseline):**
  Contains production-safe baseline defaults and non-secret JWT issuer, audience, and lifetime only. Contains **no** JWT signing key, database passwords, credentials, or local connection strings (`ConnectionStrings:DefaultConnection` is empty).
- **`appsettings.Development.json` (Local Development):**
  Contains disposable container-only defaults for zero-friction local development. These are strictly local non-production values.
- **Frontend `.env.example`:**
  Sets `VITE_API_BASE_URL=/api/v1`. The variable is optional because the frontend defaults to `/api/v1`; Vite proxies `/api` requests to `http://localhost:5055` during local development.
- **`.env`:**
  Ignored by git and untracked.
- **JWT signing key:**
  Supply `Jwt:SigningKey` through user-secrets or `Jwt__SigningKey` through the environment. At least 32 UTF-8 bytes are required; startup fails clearly when signing configuration is invalid. Never place a real key in appsettings, an example environment file, or Postman.
- **Optional Development admin:**
  `FLOWOPS_SEED_ADMIN_EMAIL`, `FLOWOPS_SEED_ADMIN_PASSWORD`, and `FLOWOPS_SEED_ADMIN_DISPLAY_NAME` come from secret configuration/environment. The bootstrap is Development-only and creates no user when required values are missing. Registration always creates a Member.

---

## Implemented vs Planned Features

### Implemented (Phases 1–3)
- [x] Layered ASP.NET Core backend solution (`Domain`, `Application`, `Infrastructure`, `Api`)
- [x] Core `WorkItem` domain entity with rich validation and strict UTC invariants
- [x] Use-case oriented persistence abstraction (`IWorkItemStore`) in Application layer
- [x] EF Core PostgreSQL persistence, fluent mappings, and initial migration
- [x] Hardened PostgreSQL role configuration (non-superuser application user)
- [x] Versioned REST API (`/api/v1/health`, `/api/v1/work-items`)
- [x] Centralized RFC 7807 `ProblemDetails` exception handling with no stack trace leakage
- [x] Interactive Swagger UI documentation at `/swagger` (Development environment)
- [x] Domain/application unit tests and PostgreSQL API integration tests for lifecycle rules, validation, queries, and migration compatibility
- [x] GitHub Actions automated backend CI workflow (restore, format check, build, test)
- [x] React 19 + TypeScript 5 + Vite 6 frontend application shell
- [x] Tailwind CSS restrained B2B operations design system & responsive layout (desktop & mobile)
- [x] Reusable UI primitives (`Button`, `Badge`, `Card`, `Table`, `Skeleton`, `EmptyState`, `ErrorState`, `PageHeader`, `Input`, `Select`, `Modal`)
- [x] Typed API client with automatic RFC 7807 `ProblemDetails` error extraction
- [x] Versioned work item lifecycle API for creation, updates, assignment, status transitions, activity, categories, and paged queries
- [x] Work item list with server-side search, filters, sorting, pagination, and resilient request states
- [x] Create/edit forms, detail and activity timeline, assignment, and validated status workflow
- [x] Frontend component/page tests for critical lifecycle paths and states
- [x] Dashboard placeholder, settings/system status page, and not-found page
- [x] Frontend CI workflow (ESLint, Prettier, Vitest, TypeScript compilation, Vite build)

### Phase 4 Stages 4A–4D
- [x] ASP.NET Core Identity in the existing PostgreSQL database, JWT register/login/me, and authenticated user directory
- [x] Admin/Member roles and server-side creator/assignee authorization
- [x] User-backed ownership and assignment, preserved legacy assignment snapshots, and authenticated activity actors
- [x] Existing optimistic concurrency contract retained for authorized mutations
- [x] Context/hooks auth state, real login/register, protected routes, current-user header, and logout
- [x] SessionStorage token/expiry restoration through authoritative `/auth/me`, with retryable loading failures
- [x] Central bearer headers restricted to the same-origin API, guarded `401` invalidation, and session-preserving `403` errors
- [x] Work item create/detail compatibility and actor display names
- [x] Capability-driven edit/status controls and user-backed assignment with preserved server versions
- [x] Lazy active-user selection for Admin assignment, permitted Member self-assignment/unassignment, and clearly labelled historical names

Legacy work items with both creator and user assignee IDs null require Admin for every work item mutation, including assignment. A Member gains assignee rights only after an Admin legitimately assigns that item; historical display-name text never grants permission. Stage 4C's final preflight tightened this boundary without adding assignment UI.

Stage 4D is completed and verified: 166 frontend tests, 82 backend unit tests, 102 PostgreSQL integration cases, and 23 real-identity browser checks pass. Formatting, lint, and builds pass. See [Phase 4 checkpoint](docs/phases/phase-4-auth-collaboration-qa.md) for the authorization matrix, additive migrations, auth session model, assignment flows, historical verification evidence, and remaining work.

### Planned (Remaining Phase 4 and Future Phases)
- [ ] Work item comments, expanded Postman workflows, manual QA, bug reports, and traceability (Phase 4)
- [ ] Workload summary dashboard & metrics (Phase 5)

---

## Local Setup & Quick Start

### 1. Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/) (Version 10.0.401 or compatible)
- [Node.js](https://nodejs.org/) 22.22.2 (the version in `frontend/.nvmrc` used by CI) and `npm`. The frontend also supports later 22.x releases, 24.15.0 or later 24.x releases, and 26+. Its locked test dependencies require these ranges; `frontend/.npmrc` enforces the `package.json` engine prerequisite during installation.
- [Docker Desktop](https://www.docker.com/) or local [PostgreSQL 17](https://www.postgresql.org/)

### 2. Database Setup

Copy the example environment configuration and start the containerized PostgreSQL 17 database:

```bash
cp .env.example .env
docker compose up -d
```

### 3. Backend Setup & Run

Configure a private JWT signing key before launching the backend API. The following command generates a new local key and stores it in the API project's user-secrets:

```bash
dotnet user-secrets set "Jwt:SigningKey" "$(openssl rand -base64 48)" \
  --project backend/src/FlowOps.Api/FlowOps.Api.csproj
```

Alternatively, supply a strong `Jwt__SigningKey` through the process environment (`FLOWOPS_JWT_SIGNING_KEY` is also supported). Safe defaults are issuer `FlowOps.Api`, audience `FlowOps.Web`, and a 60-minute access token. See [backend setup](backend/README.md) for the optional Development admin bootstrap.

EF migration tooling requires an explicit `ConnectionStrings__DefaultConnection` and does not require a JWT key. Export the disposable Docker connection string below, changing it if you customized `.env`; Docker Compose does not export its values into your shell. Then apply migrations and launch the backend API:

```bash
# Disposable local Docker database from the existing environment template
export ConnectionStrings__DefaultConnection='Host=localhost;Port=5432;Database=flowops;Username=flowops;Password=flowops_dev_pass_123'

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

Register or log in using `/api/v1/auth/register` or `/api/v1/auth/login`, then use Swagger's Authorize action with the returned bearer access token. Work item and category endpoints require authentication.

### 4. Frontend Setup & Run

In a separate terminal:

```bash
cd frontend
npm ci
npm run dev
```

The web application will be running at `http://localhost:5173`.
All requests to `/api/v1` are automatically proxied to the backend on `http://localhost:5055`.
The frontend uses `/api/v1` by default. To set it explicitly, copy `.env.example` to `.env` inside `frontend/`; keep `/api/v1` as the value for local development so requests continue through the Vite proxy.

Open `/register` to create a Member account or `/login` to sign in. Successful authentication returns to a validated requested application route; otherwise it opens `/work-items`. The current user and logout appear in the header. Reloading restores token/expiry metadata from sessionStorage and validates the user through `/auth/me`; a connection failure offers retry or sign out without silently discarding the token. Work item controls use server permission flags: Admin can open Change assignment to select an active user, while permitted Members receive Assign to me or Unassign me. Current assignee names take precedence over labelled historical snapshots. Create remains unassigned. See [frontend setup and session behavior](frontend/README.md); Postman auth expansion remains pending.

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

# Run frontend component and page tests
npm run test -- --run

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
│       ├── FlowOps.UnitTests/       # xUnit domain/application unit tests
│       └── FlowOps.IntegrationTests/ # PostgreSQL-backed API integration tests
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
│       ├── phase-2-frontend-foundation.md # Phase 2 documentation
│       ├── phase-3-work-item-lifecycle.md # Phase 3 implementation and verification
│       └── phase-4-auth-collaboration-qa.md # Backend foundation and frontend checkpoints
├── docker-compose.yml               # Hardened local PostgreSQL container configuration
├── .env.example                     # Local development environment template
├── CONTRIBUTING.md
└── LICENSE
```

---

## License

MIT.
