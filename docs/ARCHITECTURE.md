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

Controllers should not contain business rules. EF entities should not leak directly as public API contracts. Domain has no ASP.NET Identity dependencies, and Application has no Identity or EF Core dependencies.

## Stage 4A/4B identity and authorization

ASP.NET Core Identity uses the existing PostgreSQL database through Infrastructure's GUID-based Identity DbContext. Infrastructure owns `ApplicationUser : IdentityUser<Guid>`, password hashing through `UserManager`, role management through `RoleManager`, JWT issuance, and user-directory persistence. An application user also has a display name and active flag. Application consumes focused identity, token, directory, and current-user abstractions using safe DTOs and GUID IDs. API maps validated bearer claims to the current-user abstraction.

Registration always creates a Member. Admin and Member role names are centralized constants with deterministic role seed data. The optional Development admin bootstrap reads private configuration and does nothing when required values are absent; it never creates a demo admin in Production. Identity's password policy and generic login failure message avoid a home-grown authentication implementation.

JWT settings commit only issuer, audience, and token lifetime. A signing key of at least 32 UTF-8 bytes must come from environment or user-secrets; invalid configuration fails startup. Tokens carry subject, email, display name, role, and token identifier claims and expire after 60 minutes by default. Roles embedded in an issued token remain effective until it expires. Refresh tokens, revocation infrastructure, OAuth, social login, and password-reset emails are deliberate Phase 4 deferrals.

Coarse endpoint authorization requires authentication. Application then applies the work item policy: Admin can edit/change status on any item; Members can edit/change status when creator or current assignee. An Admin can assign, reassign, or unassign any item with an active user target. Members can self-assign an unassigned item and unassign themselves, but cannot assign someone else or replace/remove another assignee. Temporary Identity lockout does not deactivate assignment eligibility. Directory responses expose only user IDs and display names.

`CreatedByUserId` and `AssigneeUserId` are nullable scalar references in Domain, with Infrastructure-configured foreign keys. New items derive creator identity from the authenticated context. Legacy Phase 3 items keep null user references and their `AssigneeName` snapshot; name matching is never an ownership rule. Legacy items permit Admin detail/status mutations until legitimately user-assigned, including a Member self-assignment under the normal assignment policy. Historical snapshot text survives later assignment/unassignment.

The mutation order is resource lookup, authorization, expected-version comparison, domain mutation/activity staging, then persistence. Forbidden requests stop before mutation, events, or `SaveChanges`; permitted stale requests retain Phase 3's `409` contract. EF's concurrency token still protects races after server load. New lifecycle events derive their actor from authenticated context; historical null actors are preserved. Batched user-directory lookups resolve creator, assignee, and activity actor summaries without exposing Identity records. Server-computed response permissions guide later frontend controls while every mutation remains authoritative on the backend.

## Frontend boundaries

- **pages:** route-level composition
- **features:** workflow-specific components and hooks
- **components:** reusable UI primitives
- **api:** typed HTTP client and request contracts
- **lib:** cross-cutting utilities

UI components should not build ad-hoc fetch calls. Server state should have one predictable access pattern.

At the mandatory Stage 4A/4B checkpoint, the existing React routes/layout and API client remain the auth-free Phase 3 implementation. Protected backend requests consequently require authenticated API/Swagger tooling until Stage 4C begins. The planned frontend model is Context/hooks, a JWT in React state with optional sessionStorage to survive reloads, centralized bearer headers, protected routes, and separate handling for `401` (login flow) and `403` (permission message). This model is not implemented at the checkpoint. SessionStorage carries XSS risk, no refresh token exists in Phase 4, and a production architecture may use secure server-managed/httpOnly sessions.

## API style

- REST-oriented resources
- JSON request/response payloads
- predictable HTTP status codes
- Problem Details style errors
- server-side pagination
- explicit validation errors
- versioned API prefix (`/api/v1/...`)
- distinct `401` authentication, `403` permission, `404` resource, and `409` state/concurrency failures

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

Backend auth integration tests use real PostgreSQL with isolated schemas, fake deterministic test-only JWT configuration, and independently created users/roles. They do not need developer secrets or the optional admin bootstrap. Authorization regressions cover the role/ownership matrix, forbidden requests causing no mutation/event/save, legacy compatibility, and retained optimistic concurrency. Additive migration tests preserve Phase 3 work items/activity while moving up, down where practical, and back up. Existing frontend checks remain part of validation, but auth/assignment/comments frontend tests and expanded Postman/manual QA artifacts belong to later Phase 4 stages.

The Stage 4A/4B implementation and verification details are recorded in the [Phase 4 checkpoint](phases/phase-4-auth-collaboration-qa.md). Phase 4 implementation pauses at this review boundary; Phase 5 dashboard work remains deferred.
