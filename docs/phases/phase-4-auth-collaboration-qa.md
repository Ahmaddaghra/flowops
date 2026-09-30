# Phase 4 — Authentication, Collaboration & QA

## Incremental checkpoint: Stages 4A–4F

Phase 3 is completed and verified; its merged history and phase document remain intact. Phase 4 is in progress. The backend Stage 4A/4B checkpoint was reviewed before Stage 4C began, and Stage 4C was reviewed before Stage 4D. Stage 4D was approved before Stage 4E began. The current implementation adds persisted authenticated comments, atomic comment/activity writes, and a responsive Comments UI on that approved foundation. Stage 4E was approved before Stage 4F. Stage 4F QA depth is now completed and verified; Stage 4G has not started.

The React client supports real login/registration, protected routes, current-user identity, logout, centralized bearer tokens, user-backed assignment, permission-aware work item actions, and comments. Stage 4F adds authenticated Postman flows, manual case definitions, six resolved historical bug reports, and a requirement traceability matrix. The collection follows the current Stages 4A–4E contracts and uses placeholders only. No Phase 5 dashboard capability has been added.

## Identity architecture

Infrastructure defines `ApplicationUser : IdentityUser<Guid>` with `DisplayName` and `IsActive`, and stores Identity tables in the same PostgreSQL database as work items through the GUID-based Identity DbContext. Identity's `UserManager`, `RoleManager`, and proven password hasher own credentials and roles.

Domain remains independent of ASP.NET Identity. Application remains independent of Identity and EF Core, working through focused current-user, identity, token, and directory abstractions with app-level DTOs and GUID user IDs. API handles bearer authentication/claims wiring and transport; Application handles resource-aware permissions.

Authentication/current-user responses expose only ID, email, display name, and role names. Assignment directory responses expose ID and display name only. Infrastructure performs batched lookups for work item, activity, and comment user summaries. Password hashes, security stamps, and full Identity entities are never response contracts.

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

Access tokens contain `sub`, `email`, `name`, `role`, and `jti`. Protected requests send `Authorization: Bearer <accessToken>`. Role claims in an issued JWT remain effective until token expiry; Phase 4 has no refresh token or revocation service. Login and `/auth/me` reject inactive accounts, while work item reads and comments follow the existing validated-claim boundary without a per-request account-active lookup. Integration tests retain this existing behavior rather than adding a comment-specific identity workaround. OAuth/social login, password-reset email flows, and multi-tenancy are also deferred.

## Authorization matrix

| Capability | Admin | Member |
|---|---|---|
| List/view work items, categories, activity, and comments | Allowed | Allowed |
| Add a comment on a readable work item, including legacy items | Allowed | Allowed |
| Create work items | Allowed; current user is creator | Allowed; current user is creator |
| Edit details | Any item | Creator or current assignee |
| Change status | Any item | Creator or current assignee |
| Assign an unassigned item | Any active user | Self only when the item has a creator user ID |
| Reassign an assigned item | Any active user | Forbidden |
| Unassign | Any item | Only when assigned to self |
| Lifecycle edit/status/assignment on a legacy item with both creator and user assignee IDs null | Allowed | Forbidden until an Admin legitimately assigns a user |

A legacy item whose creator and user assignee IDs are both null is Admin-only for edit, status, and assignment; a Member cannot self-assign it. An Admin may legitimately assign an active user, after which that assignee receives the normal assignee permissions. If the item is later unassigned while creator remains null, the Admin-only boundary applies again. Matching a historical display-name string never grants access. An optional initial user assignment during creation follows the ordinary self/Admin target rule because new items always have an authenticated creator. Authoritative permissions use authenticated context, persisted user IDs, and roles; they do not trust submitted creator IDs or role values.

Coarse endpoint authorization requires authentication. The focused application authorization logic handles creator, assignee, Admin, and self-assignment decisions. The lifecycle mutation sequence is resource lookup → authorization → expected-version comparison → domain mutation/activity staging → save. A forbidden operation stops before mutation, activity, or `SaveChanges`. An allowed stale operation still returns a concurrency conflict.

Responses distinguish `401` missing/invalid/expired authentication, `403` authenticated insufficient permissions, `404` missing resource, and `409` invalid transition or concurrency conflict. Safe Problem Details never expose stack traces.

## Work item references and legacy compatibility

Work items add nullable `CreatedByUserId` and `AssigneeUserId` scalar GUID references. Infrastructure configures user foreign keys and indexes; Domain has no Identity navigation property. New work items always take creator identity from authenticated context. Existing Phase 3 rows retain null new references and their original `AssigneeName` column values.

No migration matches display names to users. New assignments use only `AssigneeUserId`; legitimate Phase 4 assignment/unassignment leaves the old snapshot intact. Work item responses include:

- nullable raw creator/assignee IDs;
- nullable `createdBy`/`assignee` summaries containing ID and display name;
- `legacyAssigneeName`, preserving the Phase 3 snapshot;
- compatibility `assigneeName`, preferring a current user display name and otherwise returning the historical snapshot;
- server-computed `permissions`: `canEdit`, `canChangeStatus`, `canAssign`, `canSelfAssign`, `canUnassign`, and `canAssignOthers`.

After removing a user assignment, the compatibility field may again contain a legacy snapshot. Stage 4C introduced read-only current/historical presentation. Stage 4D uses a shared detail/table/card display: real name when a current assignment ID exists, Assigned user unavailable if that ID has no summary, a labelled Historical assignment: NAME fallback only without a current ID, and Unassigned otherwise. Current assignment and permission decisions use user IDs, never compatibility text. Response permission flags drive the controls as UX hints; the backend rechecks every request.

## Activity and concurrency

New work item creation, field changes, status changes, and assignment changes populate `ActivityEvent.ActorUserId` from authenticated context. Activity responses include a safe `actor` summary and `actorDisplayName`. Legacy activity retains null actors and `actorDisplayName: "System"`; history is never rewritten. Creator, assignee, actor, and comment-author foreign keys restrict deletion of referenced users. Comments add `CommentAdded` with the authenticated actor and description `Comment added`, without copying the comment body into Activity.

Phase 3's `WorkItem.Version`, positive request `expectedVersion`, domain version increments, and EF concurrency token remain intact. Assignment using a user ID also requires the representation's expected version. The application rejects stale permitted requests before mutation/events/save, and EF protects races after server load. Work item and activity changes save atomically, so a failing EF concurrency check cannot leave a ghost activity event. Clients must refresh and review the newest representation before retrying rather than replay stale values automatically. Comment POST requires no expectedVersion, leaves `WorkItem.Version` and `UpdatedAtUtc` unchanged, and saves its Comment/CommentAdded together without mutating the WorkItem. An edit opened at version N remains valid after another user comments.

## Additive migrations

| Migration | Schema change |
|---|---|
| `20260929223011_AddIdentityFoundation` | GUID-based Identity users/roles/tables; display name/active user fields; deterministic Admin/Member role definitions |
| `20260929223344_AddUserBackedWorkItems` | Nullable creator and assignee user references; restrictive creator, assignee, and activity actor user foreign keys/indexes |
| `20260930092502_AddWorkItemComments` | Comments table; WorkItem cascade FK, author restrict FK, work item/timestamp index and conventional author FK index |

The additive migrations do not rewrite earlier migrations or map names to users. The migrations preserve existing work items, legacy assignment snapshots, and activity history. EF tooling requires an explicit `ConnectionStrings__DefaultConnection`; its design-time DbContext factory does not start runtime JWT authentication. Setup examples are in [backend/README.md](../../backend/README.md).

Migration checks use a disposable PostgreSQL schema containing Phase 3 records, upgrade to the current model, verify preserved records, roll down to `20260929163759_AddWorkItemConcurrency`, and apply the migrations again. Independent verification also copied the actual Phase 3 development database into a disposable database: all six work items and 15 activity events retained their original fields through up/down-to-Phase-3/up. The final schema contained both deterministic roles, and all six legacy work items retained null creator/assignee references. The source development database was untouched.

Stage 4E adds a PostgreSQL Stage 4D → latest → Stage 4D → latest test. Full snapshots preserve existing WorkItems (including versions/timestamps and creator/assignee IDs), activity, Identity users, roles/memberships, and categories. The new migration creates only Comments and its keys/indexes. Down drops the Comments table, so Stage 4E comments are lost; Up recreates an empty table. Verification uses disposable data and leaves the development database untouched.

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
| `GET`, `POST` | `/api/v1/work-items/{id}/comments` | Authenticated Admin/Member; follows work item read boundary |

The full contracts and examples are in [API Design](../API_DESIGN.md). Stage 4E includes comments GET/POST with strict body-only creation and safe author responses. Stage 4F expands the Postman collection/environment for authenticated verification; they contain no real credentials or tokens. Setup and execution are documented in [the QA guide](../qa/postman-guide.md).

## Stage 4C frontend authentication

Context/hooks expose auth state backed by a shared session store. Only the JWT access token and expiry metadata are saved to sessionStorage; user and role objects are not persisted. Login and registration use the real backend response, and registration has no role selector: the server creates a Member. The header displays the authenticated user's name/roles and logout. Logging out clears both storage values and the live session.

On reload, a stored token is validated through authoritative `/auth/me` before protected content renders. Routes show a loading state while this check is pending. Connection/server failures keep the token and show retry or explicit sign out; a true `401` clears the matching session and opens login. Browser storage failures can retain an in-memory session. No local JWT parsing establishes user identity or permissions. Client route/session guards provide UX; backend authentication and authorization remain authoritative for every protected API operation.

Public routes are `/login` and `/register`. Protected routes are `/`, `/work-items`, `/work-items/:id`, `/settings`, and the `/dashboard` placeholder. Anonymous access records the requested internal path, query, and hash. A shared return-path validator permits only known internal application routes; external or malformed destinations fall back to `/work-items`. Authenticated users opening a public auth page return to a validated intended location.

The central API client owns bearer headers. It attaches a session token only within both the configured API base and same-origin `/api/v1` scope; external and out-of-scope URLs never receive it. Protected token requests reject redirects. Register/login and public health pass `auth: false`, sending no bearer and never invalidating the current session.

A protected `401` invalidates only when that request carried the current token and its captured session revision still matches. Late failures cannot erase a newer login, and concurrent failures invalidate once. Provider guards also prevent late `/me` responses or completed sign-in attempts from restoring a signed-out session. A `403` preserves authentication and shows a permission message rather than retrying or logging out.

At the Stage 4C checkpoint, work item edit/status requests retained expectedVersion propagation and stale-route guards. Create sent `assigneeUserId: null`; unsupported free-text assignment fields were removed. Detail displayed current/historical assignment read-only, and activity displayed `actorDisplayName` with `System` for legacy events. Stage 4D added the assignment and permission controls described below; comments were deferred at those historical checkpoints and are now implemented by Stage 4E.

SessionStorage is accessible to JavaScript, so XSS can read the token. Phase 4 has no refresh token, revocation service, or client idle-expiry timer. Expiry metadata is stored, while API `401` responses and reload-time `/me` checks establish validity authoritatively. A production deployment may move toward secure server-managed/httpOnly sessions. Frontend setup and validation commands are in [frontend/README.md](../../frontend/README.md).

## Stage 4D assignment and permission-aware controls

Work item responses' `canEdit`, `canChangeStatus`, `canAssign`, `canSelfAssign`, `canUnassign`, and `canAssignOthers` capabilities drive visible actions. Missing/null permissions fail closed. The frontend does not reconstruct the authorization matrix through role checks or names. Edit details requires `canEdit`; status transition actions require `canChangeStatus`. The backend remains authoritative when controls are hidden or capabilities become stale.

The Admin assignment flow is selected by `canAssign` plus `canAssignOthers`. Change assignment lazily calls the typed `usersApi.list()` method for `/users`, which returns active `{ id, displayName }` summaries through the central protected client. An accessible Assign to select and Save assignment submit the selected user ID. Unassign is separate and sends null when permitted. Loading is announced, an empty directory is explained, and directory failure offers an isolated retry without breaking detail. Members and callers without directory capability never fetch it. Route-scoped effect cleanup suppresses late directory responses after navigation.

Members see Assign to me only when `canAssign` and `canSelfAssign` allow it; the target is the verified current auth user's ID. Unassign me sends null when `canAssign` and `canUnassign` allow it. Members have no directory picker. Legacy records with both creator and assignee user IDs null receive no Member assignment control; an Admin can establish a real assignment. Historical text never grants rights.

Create remains unassigned, submitting no creator ID and `assigneeUserId: null`. Existing assignment requests send `{ assigneeUserId, expectedVersion: item.version }`. Successful responses replace the item, including returned version and capabilities, for later edits/status/assignment. A synchronous shared detail-page mutation gate serializes these operations and blocks rapid duplicate submissions. Existing item/route guards prevent an old mutation response from overwriting a newly navigated item; versions are never incremented manually.

A mutation `403` keeps authentication and the current item, displays a permission error, and does not automatically refresh away the error. A stale `409` shows refresh/review guidance without automatic retry. Protected `401` uses the existing centralized matching-token/revision invalidation path. Backend resource → authorization → expectedVersion → mutation/activity/save ordering is unchanged; a forbidden stale request remains forbidden.

Detail, desktop table, and mobile cards share real-first assignment presentation. The name filter continues to match current user display names or a legacy snapshot only while no user is assigned, with copy explaining those semantics. Activity retains server-resolved actor names. This stage adds no backend authorization changes, comments, user management, invitations, or teams.

## Stage 4E work item comments

Domain `Comment` stores generated `Id`, route-context `WorkItemId`, authenticated `AuthorUserId`, required trimmed `Body`, and server UTC `CreatedAtUtc`. Body is limited to 2000 characters before trimming; blank/whitespace-only input is rejected and internal newlines survive. Identity navigation properties stay in Infrastructure. The author FK restricts deletion, the item FK cascades, and the work item/timestamp index supports explicit ascending timestamp/ID ordering.

GET returns an oldest-first array (empty for an item with no comments). POST accepts exactly `{ "body": "..." }` and returns `201` with `{ id, workItemId, body, createdAtUtc, author: { id, displayName } }` and a Location for GET. Strict unknown-field rejection prevents author, timestamp, role, resource ID, and expectedVersion spoofing. Any authenticated Admin or Member may comment on a readable item regardless of creator, assignee, or legacy lifecycle capabilities. Missing items return `404`, invalid bodies `400`, and missing/invalid authentication `401`. Ordinary comment creation has no version conflict or creator/assignee `403`.

Application uses existing `IWorkItemService`/`IWorkItemStore` methods, `ICurrentUser`, and `IUserDirectory`. Lists resolve distinct author IDs in one batch; unresolved summaries use `User unavailable`. Author resolution for POST occurs before staging writes so a lookup failure cannot report an HTTP failure after persistence. The comment and `CommentAdded` event share one `SaveChangesAsync` and the same UTC timestamp. The event actor is the current user and its description is `Comment added`. Neither WorkItem version nor updated timestamp changes.

The frontend adds typed Comment/CreateComment contracts and central API methods. A component keyed by item ID renders Comments separately below Activity with author, timestamp, and escaped multiline plain text. It owns loading, empty, local error/retry, and submitting states. The labelled maxLength-2000 textarea validates blank input, associates errors, prevents duplicate submissions, retains failed text, and clears successful text.

Successful POST appends the returned comment and refreshes only Activity. It leaves detail/version and open edit forms intact. Unmount and request-sequence guards suppress stale list, submit, error, retry, and completion results after navigation, including wrong-route activity refresh. Merging a late GET with comments already added prevents lost UI entries. Timestamp fractions are retained before ID tie-breaking. Comments remain outside the lifecycle mutation gate and inherit unchanged central `401`/`403` session behavior.

No comment editing, deletion, replies, reactions, mentions, attachments, rich text, notifications, or WebSockets are included.

## Verification evidence

Stage 4A verification passed 52 unit tests and 53 PostgreSQL integration cases before commit `67c0ac7` (`feat(auth): add Identity and JWT authentication foundation`). Stage 4B was committed as `8833922` (`feat(authz): enforce user-backed work item authorization`). The backend passed restore, formatting verification, build with zero warnings/errors, all 80 unit tests, and 100 real PostgreSQL integration cases. The integration total comprises 26 authentication cases, 27 retained Phase 3 lifecycle cases adapted to authenticated users, 46 authorization cases, and one Phase 3 migration compatibility case. At that backend checkpoint, the unchanged frontend passed formatting, lint, all 27 tests, and production build. The accompanying checkpoint reports list the final commit sets, changed files, and git status.

The initial Stage 4C preflight reran the 80 backend unit tests and 100 PostgreSQL integration cases successfully. A final literal re-audit found that the legacy Admin-only rule had been applied to edit/status while still permitting Member self-assignment. The focused correction now denies Member assignment as well whenever both creator and user assignee IDs are null, and aligns capability flags with that rule. Unit and real PostgreSQL regression checks cover the corrected boundary, including denial before mutation/activity/save for both current and stale versions, ordinary assignee rights after an Admin assignment, and restored Admin-only permissions after unassignment. Final verification passed restore, whole-solution formatting, full build with zero warnings/errors, all 82 unit tests, and all 102 PostgreSQL integration cases (26 authentication, 27 retained lifecycle, 48 authorization, and one migration case). The Stage 4A/4B counts above remain the recorded historical checkpoint evidence.

At the historical Stage 4C checkpoint, the frontend suite passed 115 tests across nine files: 30 work item cases (27 retained baseline cases plus three compatibility cases), 30 session/client/provider cases, and 55 auth UI/route/return-path cases. Formatting, lint with zero warnings/errors, and production build passed. The Stage 4C backend correction added no frontend controls or Stage 4D capability.

Stage 4C rendered-browser QA passed 17 checks in Chromium 151.0.7922.34 at 1440 × 1000 desktop and 390 × 844 mobile sizes, using `http://localhost:5173`, the real API on port 5055, and a disposable PostgreSQL database with Member accounts. The Browser plugin was unavailable, so QA used the existing bundled Playwright/Chromium fallback without installing repository dependencies.

The checks covered real registration/login/logout, intended routes with query/hash, authoritative `/me` restoration, work item list/create/read-only detail, current-user header, generic wrong-password failure, real unrelated-Member status `403` with the session preserved, and invalid-session `/me` clearing authentication. An intercepted `/me` `503` blocked protected content while retaining the token, then Try again restored the session through the real backend. Request checks observed bearer presence for `/me` and absence for login/public health without saving raw headers or token values.

Mobile checks covered labels, password-manager autocomplete, validation focus, complete Tab/Enter login, navigation focus trapping with Shift+Tab, Escape returning focus to the trigger, and no horizontal overflow. Desktop login/work-list and mobile login/register screenshots were inspected. There were zero runtime errors or unexpected console diagnostics; expected `401`/`403` resource diagnostics were observed for the negative cases.

Relevant checks include Identity registration/login/current-user behavior, Member-only registration, duplicate email/password validation, malformed/expired JWT rejection, protected endpoints, the full authorization/assignment matrix, forbidden operations with no mutation/activity/save, actor identity, expected-version conflicts, legacy migration compatibility, and unchanged Phase 3 lifecycle tests. Integration tests use real PostgreSQL and deterministic test-only JWT settings injected through `WebApplicationFactory`; developer secrets and optional admin seeding are unnecessary.

Backend CI retains restore, format, build, unit tests, and PostgreSQL integration tests. Frontend CI retains `npm ci`, format, lint, tests, and build. Commands are in [backend/README.md](../../backend/README.md) and [README.md](../../README.md).

A repository security review scanned 172 text files and found no new committed secrets. Existing disposable local database defaults remain unchanged, while auth test configuration uses clearly fake keys/passwords confined to tests. The review also checked registration role escalation, current-user/role trust, backend authorization, generic login errors, safe response DTOs, and credential/token logging. Signing keys and admin credentials remain private configuration.

The Stage 4C security review inspected 62 source/build files, including three generated distribution files, and reported no findings. No signing keys, credentials, or raw bearer values were introduced into frontend source or build output.

### Stage 4D automated verification

Stage 4D passes all 166 frontend tests across 12 files, adding 51 cases over the 115-test Stage 4C checkpoint. Tests cover capability-driven controls, Admin and Member assignment flows, lazy directory loading/empty/error/retry, accessible selection, current/historical assignment rendering, server version propagation, serialized mutations, `403`/`409` behavior, and late assignment/directory responses after navigation. Existing auth/session and lifecycle tests remain green. Preflight `npm ci` reported zero audit vulnerabilities; Prettier, ESLint with zero warnings/errors, and TypeScript/Vite production build pass.

The unchanged backend passes all 82 unit tests and 102 real PostgreSQL integration cases with zero failures/skips. Restore, whole-solution formatting verification, and build pass with zero warnings/errors. Stage 4D introduces no backend authorization changes. All Stage 4D exit gates passed at that historical checkpoint, before Stage 4E authorization.

### Stage 4D rendered-browser verification

Twenty-three checks pass in Chromium 151.0.7922.34 at 1440 × 1000 desktop and 390 × 844 mobile sizes against the real API and an isolated PostgreSQL database. An ephemeral Development-only Admin and two independently registered Members exercised creation, creator/assignee edit and status, eligible self-assignment, self-unassignment, Admin assignment/reassignment/unassignment, and hidden unrelated-Member controls. The API was restarted after bootstrap without seed credentials. No passwords or bearer values are retained in the evidence.

A forbidden stale UI assignment returned `403` before version checking, retained authentication and local state, and stayed visible without an automatic refresh. A deliberately invoked Member request targeting another user also returned `403`. An authorized stale assignment returned `409` with manual refresh guidance, and explicit refresh enabled a safe retry. A real assignment `401` exercised the unchanged central matching-session invalidation path and returned cleanly to login. Successful responses supplied the versions used by later mutations.

Legacy null/null records showed labelled historical text and no Member mutation controls. Admin assignment established ordinary assignee rights; Member self-unassignment restored the historical display and strict legacy boundary. Members made zero directory requests, while Admin loaded safe `{ id, displayName }` summaries only after opening the picker. A deliberately intercepted directory `503` remained local to the assignment card, and explicit retry used the real API successfully. Empty/loading/late directory cases are additionally covered by component tests.

Desktop table and mobile cards showed current real names and clearly labelled historical names; both filter semantics were verified against the real backend. The mobile native select worked through keyboard selection, Tab, and Enter; unassignment also worked by keyboard. Long unbroken historical text wrapped without mobile overflow, and the desktop assignee column stays bounded. Assignment labels, accessible button names, disabled actions, and absence of nested interactive controls were checked. Mobile navigation retained Escape/focus restoration.

Browser QA found an edit-dialog focus defect: its autofocus field could prevent returning focus to Edit details after Escape. The Modal now accepts an explicit trigger reference, and detail uses a stable close callback. A successful edit waits for its activity refresh before closing alongside the mutation unlock, so its trigger is enabled when focus returns. Three regressions cover Escape/focus trapping, activity completing while the dialog is open, and successful save with a delayed activity response. Real mobile Escape and desktop save focus checks pass.

The Browser plugin was unavailable, so these checks used the existing bundled Playwright/Chromium fallback without adding repository dependencies. Four final screenshots (desktop assignment/list and mobile assignment/historical detail) were inspected. There are zero unexpected runtime or console errors; expected negative-case `401`, `403`, `409`, and intercepted `503` resource diagnostics were excluded from that count. This local Chromium verification does not claim cross-browser coverage or later-stage Postman/manual QA artifacts.

### Stage 4E automated verification

Preflight confirmed the correct branch, clean working tree, approved Stage 4D commits, and all 82 unit, 102 PostgreSQL, and 166 frontend baseline tests passing before implementation. Final Stage 4E totals are **110 backend unit tests, 133 PostgreSQL integration cases, and 204 frontend tests across 14 files**, with no failures or skips. This adds 28 unit, 31 integration, and 38 frontend cases while retaining every previous test. Backend restore, whole-solution format verification, and build pass with zero warnings/errors. Frontend `npm ci` reports zero audit vulnerabilities; format, lint with zero warnings/errors, and TypeScript/Vite production build pass.

`CommentTests` and `WorkItemCommentServiceTests` cover body/UTC invariants, current-user authorship, safe batched author mapping/fallback, resource/auth failures, one save path, unchanged WorkItem fields, and pre-write lookup failures. `CommentsApiTests` exercise both roles, legacy items, strict identity/timestamp/resource/version spoof rejection, safe JSON shape, persistence, deterministic order, history through account deactivation, existing inactive-session semantics, activity actors, and unchanged version/updated timestamp. PostgreSQL AFTER INSERT fault triggers fail either Comments or CommentAdded ActivityEvents: both paths return a safe failure and persist neither row, followed by successful recovery. An independently authenticated user comments while an edit keeps expectedVersion N; that edit still succeeds with N.

`MigrationCommentsTests` proves Stage 4D schema/data preservation through Up/Down/Up and documents comment loss on Down. `workItems.test.ts`, `WorkItemComments.test.tsx`, and detail-page regressions cover central auth/body-only contracts, list/submission states, accessible validation, duplicate guards, failure retention, delayed GET merging, timestamp precision, route races, Activity-only refresh, and edit/status expectedVersion retention. No backend defects requiring authorization or concurrency changes were found.

### Stage 4E rendered-browser verification

Twenty checks pass in Chromium 151.0.7922.34 at 1440 × 1000 desktop and 390 × 844 mobile sizes, using two real registered Members against the real API and an isolated PostgreSQL database. Member A creates an item and sees empty Comments, submits trimmed multiline text, and sees their safe name/time plus separate authenticated Activity. Unrelated Member B sees the persisted conversation and appends another comment while lifecycle editing remains hidden. Ordering and unchanged WorkItem version/updated timestamp are checked against server state.

An edit opened at version 1 stays open while Member B comments; the original edit submits expectedVersion 1 successfully and receives version 2. Reload retrieves all comments. HTML-like text remains escaped plain text, long unbroken bodies wrap, the 2000-character textarea boundary holds, and an over-limit central API request returns real `400`. A deliberately intercepted GET `503` stays within Comments and retry uses the real backend. A failed POST retains its draft and successfully retries; intercepted `403` preserves session/draft locally. Logout clears the session, and a real comment POST `401` takes the unchanged central invalidation/protected-route path to login.

Mobile checks verify no horizontal overflow or nested interactive controls, an accessible textarea, Tab/Enter comment submission, preserved multiline text, and existing navigation Escape/focus restoration. A Member can comment on a legacy unowned item while edit/status/assignment restrictions and version remain intact. Three screenshots were visually inspected. There are zero unexpected runtime or console errors; expected `400`/`401` and intercepted `403`/`503` resource diagnostics are identified separately. Passwords, signing keys, and bearer values are omitted from evidence. The existing bundled Playwright/Chromium fallback adds no repository dependency. These Stage 4E checks do not claim cross-browser coverage or delivery of Stage 4F Postman/manual QA artifacts.

## Stage 4F QA strategy and evidence

Stage 4F started from approved HEAD `57c1cbb`, with a clean correct branch and all 110 unit, 133 PostgreSQL, and 204 frontend baseline tests plus format/lint/build gates passing. The stage adds QA depth without product features or authorization/concurrency changes. Final gates pass **110 unit tests, 135 PostgreSQL integration cases, and 204 frontend tests**, with zero failures/skips and zero build/lint warnings/errors. `npm ci` reports zero audit vulnerabilities.

### QA artifact locations and purpose

| Artifact | Purpose |
|---|---|
| [Postman collection](../postman/FlowOps.postman_collection.json) and [placeholder environment](../postman/FlowOps.local.postman_environment.json) | Eight ordered folders and 49 authenticated API requests for two Members and Admin |
| [Postman guide](../qa/postman-guide.md) | Disposable DB/API/identity setup, exact request order, variables, negative expectations, reset/rerun instructions |
| [Manual test cases](../qa/manual-test-cases.md) | 28 reproducible cases across auth, permissions, work items, concurrency, comments, responsive layout, and keyboard use |
| [Bug reports](../qa/bug-reports.md) | Six actual resolved local-development defects, with affected/fix revisions and retained regressions |
| [Traceability](../qa/traceability.md) | Important business requirements mapped to unit, PostgreSQL, frontend, Postman, and manual evidence with explicit scope gaps |

Automated tests verify domain/use-case rules, real database transactions/authorization, and deterministic UI races. Postman verifies the current HTTP workflow and representative failures directly. Manual cases provide reproducible UI/keyboard review steps; their status distinguishes designed cases and recorded prior Stage 4C/4D/4E browser evidence from a fresh manual execution. The suite is not presented as 28 newly executed manual cases. Historical bug reports explain actual engineering corrections rather than inventing incidents or claiming customer impact. The matrix maps business requirements instead of every code line and identifies database faults and client-route behavior that ordinary Postman requests cannot prove.

### Authenticated Postman verification

The collection is organized as Authentication, Users, Work Items, Assignment, Comments, Activity, Negative Authorization, and Concurrency / Conflict Cases. Public registration/login uses no bearer, normal requests use the Member token, and second-Member/Admin requests explicitly select their own captured token. Registration cannot select a role. Assignment uses real user IDs, creator/actor IDs stay server-owned, and comment POST sends body only.

Successful WorkItem mutation scripts replace `workItemVersion` with the returned server version. Comments retain a separate `commentWorkItemVersion` baseline and prove both the variable and persisted version unchanged. The deterministic stale flow keeps `staleWorkItemVersion` separate, makes a title-only winning edit with N, asserts N+1, then verifies stale edit and authorized stale assignment both return 409 while the winner remains. Negative requests cover wrong password, anonymous/malformed authentication, unrelated Member edit/status, assigning another user, title/enum/comment/version validation, missing resources, and invalid transitions. Expected 400/401/403/404/409 responses are assertions of correct behavior.

The collection and environment parse as JSON. The collection passes the [official Postman v2.1 draft-04 schema](https://schema.getpostman.com/json/collection/v2.1.0/collection.json); all 51 test/pre-request scripts parse, and 25 environment variables contain only placeholders, empty captured values, or non-secret fixture values. No Postman CLI, Newman, or postman-runtime runner was installed. An equivalent Node API executor used the actual collection request bodies, authentication overrides, pre-request hooks, and test scripts against the real .NET API and disposable PostgreSQL. **All 49 requests and 123 named assertions passed.** Independent executor checks also verified comment variables remained unchanged and successful mutations captured their returned version. No native Postman/Newman run or desktop GUI import is claimed.

### Negative-test audit and focused improvements

Existing PostgreSQL suites already cover malformed/expired/wrong-signature JWTs, anonymous protected routes, generic login failures, unrelated Member current/stale 403, prohibited assignment/reassignment/unassignment, legacy boundaries, invalid expectedVersion, stale lifecycle mutations, invalid transitions, comment validation/spoofing, atomic rollback, and version compatibility. These were retained rather than duplicated. The audit found that `InvalidExpectedVersion_ReturnsValidationProblem` sent unrelated fields to the strict assignment DTO; a 400 could therefore arise from unmapped properties. It now uses a valid route-specific payload and asserts an expectedVersion field error for all existing cases.

Two focused PostgreSQL cases in `InvalidStatus_ReturnsFieldValidationProblem_WithoutMutationOrActivity` cover unknown and numeric-looking status strings through HTTP. Both return 400 with Status errors and preserve status/version/updated timestamp/activity. Domain invalid-enum tests alone did not prove that HTTP contract. Frontend negatives already adequately cover generic login failure, central 401, preserved 403, stale edits, assignment 403/409, comment failures/drafts, and comment route races, so no duplicate frontend tests were added. No new product defect required an implementation fix.

### Secret inspection and disposable data

Repository inspection covers current tracked content plus new QA artifacts, checking committed environments, JWT/key/token literals, authorization values, credentials, and database password examples without printing their values. Postman has `.invalid` email placeholders, `CHANGE_ME` passwords, empty tokens/user/resource/version slots, and obvious non-secret missing-resource fixture GUIDs; no populated current/initial secret values are committed. Existing disposable Docker/CI defaults and clearly fake test fixtures are classified separately from secrets. The final checkpoint records scan counts and limitations. No real secret finding remains.

API QA creates ephemeral Members/Admin and a fresh signing key only in memory, against owned disposable data. Temporary servers and QA databases are cleaned up; the developer database remains untouched. Prior browser evidence remains the actual Stage 4C/4D/4E Chromium runs and is not relabelled as a fresh Stage 4F UI pass. Secret inspection is a pattern/context review of current tracked content, not a claim to scan every historical Git object or every possible secret format. Native Postman runtime/GUI import and cross-browser testing remain evidence limitations.

### Backend requirement traceability

These historical automated references remain valid. Stage 4F assigns current manual/Postman coverage in the [QA matrix](../qa/traceability.md), with explicit limitations where a unit/database or frontend behavior has no ordinary API equivalent.

| Requirement | Automated test | Manual QA / Postman |
|---|---|---|
| Registration creates Member and rejects role escalation | `AuthApiTests.Register_CreatesMember_WithSafeResponseAndExpectedJwtClaims`; `Register_RejectsRoleSpoof_WithoutCreatingAnAdmin` | See [QA matrix](../qa/traceability.md) |
| Generic login failures and JWT-protected current-user/directory | `AuthApiTests.Login_WrongPasswordAndUnknownAccount_HaveIdenticalGenericFailures`; `MeAndDirectory_RejectInvalidAuthentication` | See [QA matrix](../qa/traceability.md) |
| Anonymous work item requests return `401` | `AuthorizationApiTests.WorkItemRoutes_AnonymousRequests_ReturnUnauthorized` | See [QA matrix](../qa/traceability.md) |
| Admin/creator/assignee edit and status permissions | `WorkItemAuthorizationTests.Permissions_EditAndStatusFollowIdentity`; `AuthorizationApiTests.AuthorizedCreatorAssigneeAndAdmin_CanMutate_AndActivityUsesCaller` | See [QA matrix](../qa/traceability.md) |
| Exact self-assignment/Admin assignment policy | `WorkItemAuthorizationTests.Assignment_ExactRoleRules`; `AuthorizationApiTests.Member_CanSelfAssignAndSelfUnassign_WithoutOwningItem`; `Admin_CanAssignReassignAndUnassign_AnyActiveUser` | See [QA matrix](../qa/traceability.md) |
| Forbidden operations produce no mutation, activity, or save | `WorkItemAuthorizationTests.Forbidden_StopsBeforeVersionMutationActivityOrSave`; `AuthorizationApiTests.UnrelatedMember_IsForbiddenBeforeConcurrencyValidation_AndPersistsNoChanges` | See [QA matrix](../qa/traceability.md) |
| Legacy Member self-assignment is forbidden before current/stale version checks or writes | `WorkItemAuthorizationTests.Legacy_MemberSelfAssignmentIsForbiddenBeforeVersionValidationAndWrites`; `AuthorizationApiTests.Legacy_MemberSelfAssignmentReturnsForbiddenBeforeConcurrencyAndChangesNothing` | See [QA matrix](../qa/traceability.md) |
| Legacy names confer no ownership; Admin assignment enables ordinary rights and unassignment restores the boundary | `WorkItemAuthorizationTests.LegacyName_DoesNotGrantPermission_AndSurvivesUserAssignment`; `AuthorizationApiTests.LegacyName_GrantsNoOwnership_AdminAssignmentEnablesMemberMutation` | See [QA matrix](../qa/traceability.md) |
| Permitted stale requests preserve winning state and activity | `WorkItemServiceTests.StaleExpectedVersion_ConflictsBeforeMutationActivityOrSave`; `WorkItemsApiTests.StaleClientRepresentation_ReturnsConflictAndPreservesWinnerAndActivity` | See [QA matrix](../qa/traceability.md) |
| Additive up/down/up migration preserves Phase 3 item/activity fields | `MigrationCollaborationTests.Phase3ToLatest_DownAndUp_PreserveLegacyItemsActivityAndRoleDefinitions` | See [QA matrix](../qa/traceability.md) |

### Stage 4C frontend requirement traceability

| Requirement | Automated coverage | Manual QA / Postman |
|---|---|---|
| Token/expiry persistence and logout | `authSession.test.ts`: minimum session data, restoration, storage failure, and logout | See [QA matrix](../qa/traceability.md) |
| Authoritative restored identity and recoverable bootstrap errors | `AuthProvider.test.tsx`: pending `/me`, invalid session `401`, retry after connection/server failures, and StrictMode replay | See [QA matrix](../qa/traceability.md) |
| Central bearer scope, public auth/health, and separate `401`/`403` handling | `client.test.ts`: trusted scope, no anonymous/public bearer, protected invalidation, and preserved forbidden session | See [QA matrix](../qa/traceability.md) |
| Stale/concurrent auth cannot erase or resurrect another session | `AuthProvider.test.tsx` and `client.test.ts`: late `/me`/login, old-session `401`, and concurrent protected failures | See [QA matrix](../qa/traceability.md) |
| Protected routes and safe intended destinations | `AuthRoutes.test.tsx` and `returnPath.test.ts`: anonymous/authenticated routes, query/hash, and invalid external paths | See [QA matrix](../qa/traceability.md) |
| Real credential form requests and accessible failure states | `AuthPages.test.tsx`: validation, field focus, generic failure, retry, duplicate-submit guards, and trusted register fields | See [QA matrix](../qa/traceability.md) |
| Work item compatibility preserves concurrency/navigation | Work item form/detail/list tests: create user-ID contract, read-only historical assignment, actor names, permission errors, expectedVersion, and late-route responses | See [QA matrix](../qa/traceability.md) |

### Stage 4D frontend requirement traceability

| Requirement | Automated coverage | Manual QA / Postman |
|---|---|---|
| Server capabilities drive edit/status/assignment; null permissions fail closed | `WorkItemDetailPage.test.tsx` permission cases; `WorkItemAssignment.test.tsx` denied/null capabilities and capability-permitted selection despite a Member-labelled session | See [QA matrix](../qa/traceability.md) |
| Lazy safe directory and isolated loading/empty/error/retry states | `users.test.ts` protected safe-summary contract; `WorkItemAssignment.test.tsx` lazy opening, accessible select, directory states, and retry | See [QA matrix](../qa/traceability.md) |
| Permitted Member self-assignment/unassignment uses verified identity without directory access | `WorkItemAssignment.test.tsx` authenticated-ID self-assignment, self-unassignment, and unavailable trusted user ID | See [QA matrix](../qa/traceability.md) |
| Legacy names are clearly historical and grant no rights | `WorkItemAssignee.test.tsx` table/card real-first, historical, unavailable-summary, and unassigned rendering; detail/assignment legacy-name permission tests | See [QA matrix](../qa/traceability.md) |
| Returned server versions propagate to subsequent mutations | `WorkItemDetailPage.test.tsx`: self-assignment version 8 to status, Admin reassignment version 9 to edit, and unassignment response propagation | See [QA matrix](../qa/traceability.md) |
| `403` retains session/item/error; `409` requires explicit refresh | Assignment/detail forbidden/conflict tests; central client `401`/`403` regressions retained | See [QA matrix](../qa/traceability.md) |
| Rapid mutations serialize and late route responses cannot contaminate another item | Assignment pending/route tests and detail assignment/status serialization, late assignment, and late directory tests | See [QA matrix](../qa/traceability.md) |
| Assignee filter retains current/historical backend semantics | `WorkItemsPage.test.tsx` accessible hint, query propagation, and page reset | See [QA matrix](../qa/traceability.md) |

## Later-stage decisions and limitations

Stage 4F is completed and verified. Work stops at this checkpoint, ready for Stage 4G final Phase 4 delivery after review and authorization. Stage 4G remains responsible for final browser/documentation review, CI verification, and approved delivery; it has not begun.

Comments remain an unpaginated plain-text list with no editing, deletion, replies, real-time features, notifications, reactions, mentions, or rich text. Profile editing, dashboard aggregation, and later-phase infrastructure are not included. Existing JWT claims remain effective until expiry with no revocation service. Phase 4 remains in progress; Stage 4G and Phase 5 have not begun. No push, PR, or merge is performed by this stage.
