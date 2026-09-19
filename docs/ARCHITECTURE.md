# Architecture

## Overview

FlowOps uses a client/server architecture with a React single-page application consuming a versioned ASP.NET Core REST API backed by PostgreSQL.

```text
React + TypeScript + Tailwind
            |
         HTTPS/JSON
            |
      ASP.NET Core API
            |
  Application / Domain Rules
            |
 Entity Framework Core
            |
        PostgreSQL
```

## Backend boundaries

The backend should keep four concerns distinct even if the physical project structure is simplified:

- **API:** HTTP transport, authentication context, request/response mapping
- **Application:** use cases, orchestration, validation, authorization decisions
- **Domain:** entities, value rules, state transitions, invariants
- **Infrastructure:** EF Core, database access, authentication implementation, external integrations

Controllers should not contain business rules. EF entities should not leak directly as public API contracts.

## Frontend boundaries

- **pages:** route-level composition
- **features:** workflow-specific components and hooks
- **components:** reusable UI primitives
- **api:** typed HTTP client and request contracts
- **lib:** cross-cutting utilities

UI components should not build ad-hoc fetch calls. Server state should have one predictable access pattern.

## API style

- REST-oriented resources
- JSON request/response payloads
- predictable HTTP status codes
- Problem Details style errors
- server-side pagination
- explicit validation errors
- versioned API prefix if versioning is introduced (`/api/v1/...`)

## Security baseline

- secrets come from environment/user-secret configuration, never source control
- authorization enforced server-side
- input validated at the API/application boundary
- password storage delegated to a proven identity implementation
- CORS configured explicitly
- logs must not expose credentials/tokens

## Testing strategy

Use a test pyramid appropriate to a portfolio project:

1. unit tests for domain/application rules;
2. integration tests for API + persistence + authorization;
3. focused frontend component tests;
4. a small number of end-to-end smoke scenarios only if time allows.

The goal is confidence in business behavior, not an artificial coverage percentage.
