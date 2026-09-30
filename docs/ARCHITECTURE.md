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

Coarse endpoint authorization requires authentication. Application then applies the work item policy: Admin can edit/change status on any item; Members can edit/change status when creator or current assignee. An Admin can assign, reassign, or unassign any item with an active user target. Members can self-assign an unassigned item with a creator user ID and unassign themselves, but cannot assign someone else or replace/remove another assignee. Temporary Identity lockout does not deactivate assignment eligibility. Directory responses expose only user IDs and display names.

`CreatedByUserId` and `AssigneeUserId` are nullable scalar references in Domain, with Infrastructure-configured foreign keys. New items derive creator identity from the authenticated context. Legacy Phase 3 items keep null user references and their `AssigneeName` snapshot; name matching is never an ownership rule. When both user references are null, every work item mutation, including assignment, requires Admin. An Admin's legitimate assignment establishes ordinary assignee permissions; a Member cannot self-assign the legacy item. Removing that assignment while the creator remains null restores the Admin-only boundary. Historical snapshot text survives later assignment/unassignment. Stage 4C's final preflight tightened assignment authorization and capability flags to match this rule.

The mutation order is resource lookup, authorization, expected-version comparison, domain mutation/activity staging, then persistence. Forbidden requests stop before mutation, events, or `SaveChanges`; permitted stale requests retain Phase 3's `409` contract. EF's concurrency token still protects races after server load. New lifecycle events derive their actor from authenticated context; historical null actors are preserved. Batched user-directory lookups resolve creator, assignee, and activity actor summaries without exposing Identity records. Server-computed response permissions drive frontend controls while every mutation remains authoritative on the backend.

## Frontend boundaries

- **pages:** route-level composition
- **features:** workflow-specific components and hooks
- **components:** reusable UI primitives
- **api:** typed HTTP client and request contracts
- **lib:** cross-cutting utilities

UI components should not build ad-hoc fetch calls. Server state should have one predictable access pattern.

The reviewed Stage 4A/4B checkpoint established the backend foundation. Stage 4C implements Context/hooks backed by a shared session store, with only token/expiry metadata persisted in sessionStorage. Reload validates identity through authoritative `/auth/me` before rendering protected content; network/server failures retain the token and offer retry or sign out. Real registration/login returns backend tokens, and protected application routes preserve only safe internal intended routes. Client route/session guards provide UX; backend authentication and authorization remain authoritative.

The centralized client attaches bearer headers only within the configured API base and same-origin `/api/v1` boundary. Public register/login/health calls explicitly omit authentication. A protected `401` invalidates only the matching token/session revision, protecting newer logins from late or concurrent failures; `403` preserves the session and displays the permission error. Provider guards prevent late identity or sign-in results from restoring a signed-out session. No refresh token, revocation service, or client idle-expiry timer exists; API `401` or restored `/me` resolves expired credentials. SessionStorage carries XSS risk, and a production architecture may use secure server-managed/httpOnly sessions.

Stage 4D consumes the response's six permission capabilities without reproducing the backend role/ownership matrix in JSX. Missing/null capabilities hide mutation controls. `canEdit` and `canChangeStatus` govern detail actions; `canAssign` plus the specific assignment capabilities govern user selection, self-assignment, and unassignment. The verified auth user ID is used only as the self-assignment target. Historical names never influence capabilities.

The directory-capable Admin flow lazily loads safe active-user summaries when Change assignment opens. Members and callers without that capability never fetch the directory. Loading, empty, error, and retry states stay within the assignment card. The shared assignment display uses the real user summary when a current assignment ID exists, a safe unavailable-summary label if necessary, a clearly labelled historical fallback with no current ID, and Unassigned otherwise. Desktop/mobile list rendering uses the same component, while the name filter retains the backend's current-name/legacy-fallback query semantics.

Edit, status, and assignment share a synchronous mutation gate. Assignment sends the current server version; successful responses replace the item's version and capabilities for subsequent actions. Existing route/request guards suppress late results after navigation. `403` keeps the item/session and visible error without automatic refresh; `409` offers manual refresh/review guidance with no retry; `401` uses the centralized session path. Creation remains unassigned with JWT-derived creator identity. Comments are outside Stage 4D.

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

Backend auth integration tests use real PostgreSQL with isolated schemas, fake deterministic test-only JWT configuration, and independently created users/roles. They do not need developer secrets or the optional admin bootstrap. Authorization regressions cover the role/ownership matrix, forbidden requests causing no mutation/event/save, the Admin-only legacy boundary, and retained optimistic concurrency. Additive migration tests preserve Phase 3 work items/activity while moving up, down where practical, and back up. Stage 4C frontend tests cover authentication forms, protected routes, session restoration, token boundaries, stale/concurrent responses, permission errors, and retained work item regressions. Stage 4D adds visible capability/assignment behavior, lazy directory states, version propagation, mutation serialization, historical presentation, and error/navigation regressions. Desktop/mobile browser checks exercise the real API. Comments and expanded Postman/manual QA artifacts remain later-stage work.

The Stage 4A/4B foundation, historical Stage 4C evidence, and current Stage 4D implementation are recorded in the [Phase 4 checkpoint](phases/phase-4-auth-collaboration-qa.md). Stage 4D is completed and verified, and Phase 4 remains in progress. Stage 4E comments and Phase 5 dashboard work have not started.
