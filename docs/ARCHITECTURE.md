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

`CreatedByUserId` and `AssigneeUserId` are nullable scalar references in Domain, with Infrastructure-configured foreign keys. New items derive creator identity from the authenticated context. Legacy Phase 3 items keep null user references and their `AssigneeName` snapshot; name matching is never an ownership rule. When both user references are null, lifecycle edits, status changes, and assignment require Admin. An Admin's legitimate assignment establishes ordinary assignee permissions; a Member cannot self-assign the legacy item. Removing that assignment while the creator remains null restores the Admin-only boundary. Historical snapshot text survives later assignment/unassignment. Stage 4C's final preflight tightened assignment authorization and capability flags to match this rule.

The mutation order is resource lookup, authorization, expected-version comparison, domain mutation/activity staging, then persistence. Forbidden requests stop before mutation, events, or `SaveChanges`; permitted stale requests retain Phase 3's `409` contract. EF's concurrency token still protects races after server load. New lifecycle events derive their actor from authenticated context; historical null actors are preserved. Batched user-directory lookups resolve creator, assignee, and activity actor summaries without exposing Identity records. Server-computed response permissions drive frontend controls while every mutation remains authoritative on the backend.

## Stage 4E comments

Comments use the existing authenticated Admin/Member work item read boundary. They are allowed independently of creator/assignee lifecycle permissions, including on legacy null/null records. Strict transport accepts only body; Application derives authorship from `ICurrentUser`, checks the resource, validates the Domain Comment, resolves safe author information, stages Comment and CommentAdded, and calls the store's save once. Infrastructure owns FK mappings and EF's atomic transaction. Domain contains GUID references without Identity types, and Application gains no EF/Identity dependencies or generic repositories.

GET orders comments oldest-first by UTC timestamp then ID and resolves distinct authors in one user-directory batch. Bodies are separate from concise activity descriptions. Comment writes never load the item for mutation or alter WorkItem version/updated timestamp; existing expectedVersion behavior remains intact. Existing JWT claim validity, login, and `/auth/me` account checks remain unchanged; deactivation does not add a new per-request work item/comment lookup or revocation service.

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

Stage 4E composes a keyed Comments component below Activity. Typed API methods use the central authenticated client. The component owns list and submission state, isolated retries, accessible validation, a synchronous duplicate guard, and retained failed drafts. It renders escaped multiline plain text with long-word wrapping. Successful POST appends the returned comment and refreshes Activity only, preserving local detail/version and open edit forms.

Unmount and list-request sequence guards isolate responses from old items, including POST success/error/finally and retry results. A pending GET merges with comments already added successfully, and timestamp fractions remain significant before the ID tie-breaker. Comments stay outside the lifecycle mutation gate because their writes do not mutate the WorkItem. Existing central matching-session `401` invalidation and session-preserving `403` behavior apply unchanged.

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
- frontend uses the same-origin API; cross-origin bearer forwarding is unsupported
- logs must not expose credentials/tokens

## Testing strategy

Use a test pyramid appropriate to a portfolio project:

1. unit tests for domain/application rules;
2. integration tests for API + persistence + authorization;
3. focused frontend component tests;
4. a small number of end-to-end smoke scenarios only if time allows.

The goal is confidence in business behavior, not an artificial coverage percentage.

Backend auth integration tests use real PostgreSQL with isolated schemas, fake deterministic test-only JWT configuration, and independently created users/roles. They do not need developer secrets or the optional admin bootstrap. Authorization regressions cover the role/ownership matrix, forbidden requests causing no mutation/event/save, the Admin-only legacy boundary, and retained optimistic concurrency. Additive migration tests preserve Phase 3 work items/activity while moving up, down where practical, and back up. Stage 4C frontend tests cover authentication forms, protected routes, session restoration, token boundaries, stale/concurrent responses, permission errors, and retained work item regressions. Stage 4D adds visible capability/assignment behavior, lazy directory states, version propagation, mutation serialization, historical presentation, and error/navigation regressions. Desktop/mobile browser checks exercise the real API. Stage 4E adds 28 domain/application unit cases, 31 PostgreSQL cases, and 38 frontend cases. Fault-trigger integration tests prove both comment/activity rollback paths, and Stage 4D migration Up/Down/Up preserves existing data. Deferred frontend responses prove route isolation and unchanged expectedVersion. Twenty real-API Chromium checks pass at desktop/mobile sizes, including two authors, an open edit during another comment, retry, authentication, and keyboard submission. Stage 4F adds authenticated Postman/API verification and manual/bug/traceability artifacts, plus a focused audit of existing negative tests. Only meaningful gaps are addressed; no product feature is added.

The [Phase 4 document](phases/phase-4-auth-collaboration-qa.md) records the final architecture, historical checkpoints, and acceptance/delivery evidence. Stage 4G repeats all local gates: 110 unit, 135 PostgreSQL, and 204 frontend tests plus format/lint/build; 49 collection requests and 123 assertions pass through equivalent API/script execution, with native Postman/Newman unobserved. Thirty-four fresh Chromium desktop/mobile/keyboard checks pass with real identities and zero unexpected errors. [QA artifacts](qa/traceability.md) distinguish automated/API/browser evidence from 28 designed manual cases. Phase 5 has not begun.
