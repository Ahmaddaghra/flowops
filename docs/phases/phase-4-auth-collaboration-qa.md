# Phase 4 — Authentication, Collaboration & QA

## Stage 4A/4B checkpoint

Phase 3 is completed and verified; its merged history and phase document remain intact. Phase 4 is in progress. This checkpoint covers backend Identity/JWT authentication and server-side work item authorization only. Implementation pauses for review before Stage 4C.

The existing React client and Postman collection are still the Phase 3 implementations. They do not yet send bearer tokens or user-backed assignment requests. Review protected endpoints using Swagger or authenticated API tooling. Frontend authentication, assignment controls, comments, expanded Postman flows, manual QA, representative bug reports, and traceability are pending later stages. No Phase 5 dashboard capability has been added.

## Identity architecture

Infrastructure defines `ApplicationUser : IdentityUser<Guid>` with `DisplayName` and `IsActive`, and stores Identity tables in the same PostgreSQL database as work items through the GUID-based Identity DbContext. Identity's `UserManager`, `RoleManager`, and proven password hasher own credentials and roles.

Domain remains independent of ASP.NET Identity. Application remains independent of Identity and EF Core, working through focused current-user, identity, token, and directory abstractions with app-level DTOs and GUID user IDs. API handles bearer authentication/claims wiring and transport; Application handles resource-aware permissions.

Authentication/current-user responses expose only ID, email, display name, and role names. Assignment directory responses expose ID and display name only. Infrastructure performs batched lookups for work item and activity user summaries. Password hashes, security stamps, and full Identity entities are never response contracts.

## User and role model

- Exactly two application roles exist: `Admin` and `Member`, with centralized constants and deterministic seed definitions.
- Registration always creates a Member. Public registration has no role choice.
- Email addresses are unique, including a database unique index on normalized email. Passwords require at least eight characters with uppercase, lowercase, and a digit; special characters are optional. Five failed access attempts cause a 15-minute lockout.
- Failed login reports `Invalid email or password.` without identifying whether the account exists.
- `IsActive` defaults true and controls assignment eligibility. Temporary login lockout does not deactivate a user. No user-management API is included.
- Integration tests create their own users/roles and do not use developer admin credentials.

The optional local admin bootstrap runs only in Development. Its configuration/environment values are `FLOWOPS_SEED_ADMIN_EMAIL`, `FLOWOPS_SEED_ADMIN_PASSWORD`, and `FLOWOPS_SEED_ADMIN_DISPLAY_NAME`. No default password is committed, any missing value skips user creation, and Production never runs the demo bootstrap. Existing Admin accounts are unchanged; the bootstrap refuses to elevate an existing non-admin account with the configured email. Setup commands are in [backend/README.md](../../backend/README.md).

## JWT configuration

| Setting | Default/source |
|---|---|
| `Jwt:Issuer` | Non-secret `FlowOps.Api` |
| `Jwt:Audience` | Non-secret `FlowOps.Web` |
| `Jwt:AccessTokenMinutes` | Non-secret `60` |
| `Jwt:SigningKey` | Required private user-secret/environment value; at least 32 UTF-8 bytes |

Use `Jwt__SigningKey` for environment configuration or set `Jwt:SigningKey` in the API project's user-secrets; `FLOWOPS_JWT_SIGNING_KEY` is an optional fallback. Invalid signing configuration fails startup clearly. Tokens use HS256 and validate issuer, audience, signature, and lifetime with zero clock skew. The configured lifetime must be 1–1,440 minutes. Signing keys, real tokens, and passwords must never be committed to application settings, environment examples, or Postman assets.

Access tokens contain `sub`, `email`, `name`, `role`, and `jti`. Protected requests send `Authorization: Bearer <accessToken>`. Role claims in an issued JWT remain effective until token expiry; Phase 4 has no refresh token or revocation service. OAuth/social login, password-reset email flows, and multi-tenancy are also deferred.

## Authorization matrix

| Capability | Admin | Member |
|---|---|---|
| List/view work items, categories, and activity | Allowed | Allowed |
| Create work items | Allowed; current user is creator | Allowed; current user is creator |
| Edit details | Any item | Creator or current assignee |
| Change status | Any item | Creator or current assignee |
| Assign an unassigned item | Any active user | Self only |
| Reassign an assigned item | Any active user | Forbidden |
| Unassign | Any item | Only when assigned to self |
| Edit/status on legacy item with no creator or user assignee | Allowed | Forbidden until legitimately user-assigned |

A Member may self-assign a legacy item under the ordinary unassigned-item rule and then gains assignee permissions. Matching a historical display-name string never grants access. An optional initial user assignment during creation follows the same self/Admin target rule. Authoritative permissions use authenticated context, persisted user IDs, and roles; they do not trust submitted creator IDs or role values.

Coarse endpoint authorization requires authentication. The focused application authorization logic handles creator, assignee, Admin, and self-assignment decisions. The mutation sequence is resource lookup → authorization → expected-version comparison → domain mutation/activity staging → save. A forbidden operation stops before mutation, activity, or `SaveChanges`. An allowed stale operation still returns a concurrency conflict.

Responses distinguish `401` missing/invalid/expired authentication, `403` authenticated insufficient permissions, `404` missing resource, and `409` invalid transition or concurrency conflict. Safe Problem Details never expose stack traces.

## Work item references and legacy compatibility

Work items add nullable `CreatedByUserId` and `AssigneeUserId` scalar GUID references. Infrastructure configures user foreign keys and indexes; Domain has no Identity navigation property. New work items always take creator identity from authenticated context. Existing Phase 3 rows retain null new references and their original `AssigneeName` column values.

No migration matches display names to users. New assignments use only `AssigneeUserId`; legitimate Phase 4 assignment/unassignment leaves the old snapshot intact. Work item responses include:

- nullable raw creator/assignee IDs;
- nullable `createdBy`/`assignee` summaries containing ID and display name;
- `legacyAssigneeName`, preserving the Phase 3 snapshot;
- compatibility `assigneeName`, preferring a current user display name and otherwise returning the historical snapshot;
- server-computed `permissions`: `canEdit`, `canChangeStatus`, `canAssign`, `canSelfAssign`, `canUnassign`, and `canAssignOthers`.

After removing a user assignment, the compatibility display may again show a legacy snapshot. Later UI work must label that text as historical and read-only. Current assignment and permission decisions use user IDs, never the compatibility text. Response permission flags are UX hints; the backend rechecks every request.

## Activity and concurrency

New work item creation, field changes, status changes, and assignment changes populate `ActivityEvent.ActorUserId` from authenticated context. Activity responses include a safe `actor` summary and `actorDisplayName`. Legacy activity retains null actors and `actorDisplayName: "System"`; history is never rewritten. Creator, assignee, and actor foreign keys restrict deletion of referenced users.

Phase 3's `WorkItem.Version`, positive request `expectedVersion`, domain version increments, and EF concurrency token remain intact. Assignment using a user ID also requires the representation's expected version. The application rejects stale permitted requests before mutation/events/save, and EF protects races after server load. Work item and activity changes save atomically, so a failing EF concurrency check cannot leave a ghost activity event. Clients must refresh and review the newest representation before retrying rather than replay stale values automatically.

## Additive migrations

| Migration | Schema change |
|---|---|
| `20260929223011_AddIdentityFoundation` | GUID-based Identity users/roles/tables; display name/active user fields; deterministic Admin/Member role definitions |
| `20260929223344_AddUserBackedWorkItems` | Nullable creator and assignee user references; restrictive creator, assignee, and activity actor user foreign keys/indexes |

Neither migration rewrites earlier migrations or maps names to users. The migrations preserve existing work items, legacy assignment snapshots, and activity history. EF tooling requires an explicit `ConnectionStrings__DefaultConnection`; its design-time DbContext factory does not start runtime JWT authentication. Setup examples are in [backend/README.md](../../backend/README.md).

Migration checks use a disposable PostgreSQL schema containing Phase 3 records, upgrade to the current model, verify preserved records, roll down to `20260929163759_AddWorkItemConcurrency`, and apply the migrations again. Independent verification also copied the actual Phase 3 development database into a disposable database: all six work items and 15 activity events retained their original fields through up/down-to-Phase-3/up. The final schema contained both deterministic roles, and all six legacy work items retained null creator/assignee references. The source development database was untouched.

Rolling down the ownership migration removes new ownership/assignment references. Rolling down Identity removes accounts and roles. Original Phase 3 application records remain, but Phase 4 user data should be backed up before any real rollback.

## Current API

| Method | Endpoint | Access |
|---|---|---|
| `GET` | `/api/v1/health` | Public |
| `POST` | `/api/v1/auth/register` | Public; creates Member |
| `POST` | `/api/v1/auth/login` | Public |
| `GET` | `/api/v1/auth/me` | Authenticated |
| `GET` | `/api/v1/users` | Authenticated |
| `GET` | `/api/v1/categories` | Authenticated |
| `GET`, `POST` | `/api/v1/work-items` | Authenticated; create assignment policy enforced |
| `GET`, `PATCH` | `/api/v1/work-items/{id}` | Authenticated; edit policy enforced |
| `POST` | `/api/v1/work-items/{id}/status` | Authenticated; status policy enforced |
| `POST` | `/api/v1/work-items/{id}/assign` | Authenticated; assignment policy enforced |
| `GET` | `/api/v1/work-items/{id}/activity` | Authenticated |

The full contracts and examples are in [API Design](../API_DESIGN.md). There are no comments endpoints at this checkpoint. The existing Postman collection/environment are preserved for the later Stage 4F auth workflow expansion; they contain no real credentials or tokens.

## Verification evidence

Stage 4A verification passed 52 unit tests and 53 PostgreSQL integration cases before commit `67c0ac7` (`feat(auth): add Identity and JWT authentication foundation`). Stage 4B was committed as `8833922` (`feat(authz): enforce user-backed work item authorization`). The complete backend passed restore, formatting verification, build with zero warnings/errors, all 80 unit tests, and 100 real PostgreSQL integration cases. The integration total comprises 26 authentication cases, 27 retained Phase 3 lifecycle cases adapted to authenticated users, 46 authorization cases, and one Phase 3 migration compatibility case. The unchanged frontend passed formatting, lint, all 27 tests, and production build. The accompanying checkpoint report lists the final commit set, changed files, and git status.

Relevant checks include Identity registration/login/current-user behavior, Member-only registration, duplicate email/password validation, malformed/expired JWT rejection, protected endpoints, the full authorization/assignment matrix, forbidden operations with no mutation/activity/save, actor identity, expected-version conflicts, legacy migration compatibility, and unchanged Phase 3 lifecycle tests. Integration tests use real PostgreSQL and deterministic test-only JWT settings injected through `WebApplicationFactory`; developer secrets and optional admin seeding are unnecessary.

Backend CI retains restore, format, build, unit tests, and PostgreSQL integration tests. Frontend CI retains `npm ci`, format, lint, tests, and build. Commands are in [backend/README.md](../../backend/README.md) and [README.md](../../README.md).

A repository security review scanned 172 text files and found no new committed secrets. Existing disposable local database defaults remain unchanged, while auth test configuration uses clearly fake keys/passwords confined to tests. The review also checked registration role escalation, current-user/role trust, backend authorization, generic login errors, safe response DTOs, and credential/token logging. Signing keys and admin credentials remain private configuration.

### Backend requirement traceability

These existing automated tests map the backend checkpoint requirements. Manual QA case IDs and authenticated Postman request mappings remain pending Stage 4F; this checkpoint does not claim those artifacts are delivered.

| Requirement | Automated test | Manual QA / Postman |
|---|---|---|
| Registration creates Member and rejects role escalation | `AuthApiTests.Register_CreatesMember_WithSafeResponseAndExpectedJwtClaims`; `Register_RejectsRoleSpoof_WithoutCreatingAnAdmin` | Pending Stage 4F |
| Generic login failures and JWT-protected current-user/directory | `AuthApiTests.Login_WrongPasswordAndUnknownAccount_HaveIdenticalGenericFailures`; `MeAndDirectory_RejectInvalidAuthentication` | Pending Stage 4F |
| Anonymous work item requests return `401` | `AuthorizationApiTests.WorkItemRoutes_AnonymousRequests_ReturnUnauthorized` | Pending Stage 4F |
| Admin/creator/assignee edit and status permissions | `WorkItemAuthorizationTests.Permissions_EditAndStatusFollowIdentity`; `AuthorizationApiTests.AuthorizedCreatorAssigneeAndAdmin_CanMutate_AndActivityUsesCaller` | Pending Stage 4F |
| Exact self-assignment/Admin assignment policy | `WorkItemAuthorizationTests.Assignment_ExactRoleRules`; `AuthorizationApiTests.Member_CanSelfAssignAndSelfUnassign_WithoutOwningItem`; `Admin_CanAssignReassignAndUnassign_AnyActiveUser` | Pending Stage 4F |
| Forbidden operations produce no mutation, activity, or save | `WorkItemAuthorizationTests.Forbidden_StopsBeforeVersionMutationActivityOrSave`; `AuthorizationApiTests.UnrelatedMember_IsForbiddenBeforeConcurrencyValidation_AndPersistsNoChanges` | Pending Stage 4F |
| Legacy names do not confer ownership or disappear on user assignment | `WorkItemAuthorizationTests.LegacyName_DoesNotGrantPermission_AndSurvivesUserAssignment` | Pending Stage 4F |
| Permitted stale requests preserve winning state and activity | `WorkItemServiceTests.StaleExpectedVersion_ConflictsBeforeMutationActivityOrSave`; `WorkItemsApiTests.StaleClientRepresentation_ReturnsConflictAndPreservesWinnerAndActivity` | Pending Stage 4F |
| Additive up/down/up migration preserves Phase 3 item/activity fields | `MigrationCollaborationTests.Phase3ToLatest_DownAndUp_PreserveLegacyItemsActivityAndRoleDefinitions` | Pending Stage 4F |

## Later-stage decisions and limitations

Stage 4C will add Context/hooks auth state, login/register, protected React routes, token-aware central API calls, current-user display, and logout. The planned token model holds JWT access tokens in React state and may use sessionStorage to survive reloads; it is not implemented yet. SessionStorage carries XSS risk, there is no refresh token, and a production deployment may move toward secure server-managed/httpOnly sessions. `401` should enter the login flow, while `403` should show a permission message without clearing the session.

Stage 4D will replace free-text assignment with real user selection/self-assignment and server-computed permission hints while retaining expectedVersion. Stage 4E will add persisted comments, authenticated authors, comment activity, and UI; the intended atomic comment/activity write will not increment the work item version for a comment alone. Stages 4F/4G will add authenticated/negative Postman flows, focused manual QA cases, real historical development bug reports, requirement traceability, browser QA, final documentation, CI verification, and PR delivery.

No comments, real-time features, notifications, reactions, mentions, rich text, profile editing, dashboard aggregation, or later-phase infrastructure are included in the checkpoint. Phase 4 remains in progress, and implementation resumes beyond Stage 4B only after the checkpoint is reviewed.
