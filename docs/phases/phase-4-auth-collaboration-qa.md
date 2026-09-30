# Phase 4 — Authentication, Collaboration & QA

## Objective and acceptance

Phase 4 is completed and verified locally. It adds real authenticated user boundaries, collaboration, and reproducible QA while preserving the Phase 3 lifecycle and concurrency contracts. Stage 4G audited the complete branch from approved Stage 4F baseline `5467b84`, repeated all local gates, and performed a fresh real-API browser smoke. Final PR, CI, and review evidence is recorded in the delivery section below. The PR remains unmerged; Phase 5 has not begun.

## Identity architecture

Infrastructure owns `ApplicationUser : IdentityUser<Guid>`, Identity persistence in the existing PostgreSQL database, password hashing through `UserManager`, role management, JWT issuance, and batched user lookup. API owns bearer validation, HTTP contracts, and the validated current-user context. Application owns resource authorization and orchestration through focused interfaces. Domain contains scalar GUID references and business invariants without Identity dependencies; Application references neither Identity nor EF Core.

Authentication DTOs expose ID, email, display name, and role names. Assignment, creator, assignee, actor, and author summaries expose only ID/display name. Password hashes, security stamps, and full Identity entities are never public response contracts. See [Architecture](../ARCHITECTURE.md), [Data Model](../DATA_MODEL.md), and [API Design](../API_DESIGN.md).

## JWT and roles

Registration always creates `Member`; strict request DTOs reject client role selection. The two deterministic roles are `Admin` and `Member`. Identity enforces unique email and passwords with at least eight characters, uppercase, lowercase, and a digit. Five failed attempts cause a 15-minute lockout. Wrong credentials, unknown, inactive, and locked accounts share `Invalid email or password.`.

Tokens use HS256 with `sub`, `email`, `name`, `role`, and `jti`, and validate issuer, audience, signature, expiry, and a nonempty GUID subject with zero clock skew. Defaults are issuer `FlowOps.Api`, audience `FlowOps.Web`, and 60 minutes; lifetime configuration permits 1–1,440 minutes. A signing key of at least 32 UTF-8 bytes is required through private user-secrets/environment; invalid configuration fails before accepting requests or bootstrap writes.

The optional Admin bootstrap is Development-only, requires all three private email/password/display-name values, and does nothing when any is missing. It leaves an existing Admin unchanged and refuses to promote an existing Member. [Backend setup](../../backend/README.md) documents configuration. No signing key or Admin credential is migration seed data.

## Authorization matrix

| Operation | Admin | Member |
|---|---|---|
| Read items, categories, activity, comments | Allowed | Allowed |
| Create | Current user is creator | Current user is creator |
| Edit details / change status | Any item | Creator or real current assignee |
| Assign unassigned item | Any active user | Self, only when a creator user ID exists |
| Reassign assigned item | Any active user | Forbidden |
| Unassign | Any item | Own current assignment only |
| Legacy null creator / null real assignee lifecycle mutations | Allowed | Forbidden until Admin establishes assignment |
| Add a comment on a readable item | Current user is author | Current user is author |

Server authorization is authoritative. The sequence is resource lookup → authorization → expected-version comparison → mutation/activity staging → save. Forbidden requests stop before mutation, events, and save, including when their submitted version is stale. `401` means invalid/missing authentication; `403` means authenticated insufficient permission and preserves the frontend session. Safe `404`/`409` responses distinguish missing resources and state/version conflicts.

## Ownership, assignment, and legacy compatibility

New work items derive `CreatedByUserId` from the authenticated context. Current assignments use `AssigneeUserId` and active user targets. Nullable references preserve old records, and migrations never infer identities by matching names. `AssigneeName` survives as historical text and grants no rights.

An Admin assignment on a null/null legacy item establishes ordinary assignee rights. Removing that assignment restores the Admin-only lifecycle boundary when creator remains null. Comments independently follow the authenticated read policy and are allowed on legacy items. Safe response summaries and six server-computed capabilities drive frontend controls; missing capabilities fail closed. Admin loads the active-user directory lazily, while permitted Members self-assign/unassign without a picker or directory request.

Current real names take precedence. Missing summaries display Assigned user unavailable, and legacy-only text is labelled Historical assignment. Successful mutations replace the returned version and capabilities; frontend code never increments the version itself.

## Frontend session and protected routes

Context/hooks share an auth store. Only token and expiry metadata persist in sessionStorage; reload verifies identity through `/auth/me` before protected content renders. Network/server bootstrap failures retain the token and offer retry/sign out. Protected `401` invalidates only the matching token/session revision; late `/me`, login, and old `401` responses cannot resurrect logout or erase a newer session. `403` retains authentication.

Login/register are public. Work item routes, settings, and the existing dashboard placeholder are protected. Intended routes retain only validated internal paths/query/hash. The central API client attaches bearer headers only within the configured same-origin `/api/v1` scope, rejects redirects for protected token requests, and omits authentication on public login/register/health. SessionStorage is JavaScript-accessible and carries XSS exposure; it is not an httpOnly session. See [frontend setup](../../frontend/README.md).

## Comments and activity actors

Comment POST accepts only `{ body }`; item ID comes from the route, author from `ICurrentUser`, and timestamp from server UTC. Blank input and more than 2000 characters before trimming are rejected; outer whitespace is trimmed and internal newlines retained. GET is oldest-first by timestamp then ID, with batched safe author summaries and a User unavailable fallback.

One save atomically persists Comment and authenticated `CommentAdded` activity. Its description is `Comment added`; the body is not copied to activity. Lifecycle events also derive actors from current-user context, while historical null actors retain System. User foreign keys restrict referenced account deletion; item deletion cascades to comments/activity.

The Comments UI supports loading, empty, local error/retry, accessible validation, duplicate-submit guards, retained failed drafts, and escaped multiline text with long-word wrapping. Successful POST appends the returned comment and refreshes Activity only. Item/request guards isolate late GET/POST/retry results, and merging prevents a delayed GET from losing a successful new comment. No editing, deletion, replies, or rich text is included.

## Concurrency

Phase 3 `WorkItem.Version`, positive lifecycle `expectedVersion`, pre-mutation stale checks, and the EF concurrency token remain intact. Authorized stale clients and races after server load return safe `409`, preserving the winning item and rolling back losing activity. Edit/status/assignment share a frontend mutation gate; conflicts retain visible errors/drafts, require explicit refresh/review, and never retry automatically.

Comments require no expectedVersion and change neither WorkItem version nor UpdatedAtUtc. They remain outside the lifecycle mutation gate. An edit opened at version N still submits N successfully after another user comments. PostgreSQL interleaving and AFTER INSERT fault-trigger tests prove rollback; ordinary sequential HTTP requests alone are not presented as that evidence.

## Additive migrations

| Phase 4 migration | Change |
|---|---|
| `20260929223011_AddIdentityFoundation` | GUID Identity schema, display name/active state, deterministic Admin/Member roles |
| `20260929223344_AddUserBackedWorkItems` | Nullable creator/assignee IDs, user foreign keys/indexes including activity actors |
| `20260930092502_AddWorkItemComments` | Comments table, item cascade/author restrict FKs, item/timestamp and author indexes |

All three historical Phase 1/3 migrations and Designers remain unchanged. Fresh disposable databases migrated from zero through all six migrations; expected roles, tables, FKs/indexes, normal startup, and no pending model changes were verified. PostgreSQL tests preserve Phase 3 data through up/down/up and Stage 4D data through comments up/down/up. Down discards the relevant new Identity/ownership/comment data and is exercised only on disposable data. Developer data remained six items, 15 events, and three historical migrations.

## Automated testing and final local gates

| Gate | Stage 4G result |
|---|---|
| Backend restore / format verification / build | Passed; zero build warnings/errors |
| Domain/Application unit tests | 110 passed; zero failed/skipped |
| Real PostgreSQL integration tests | 135 passed; zero failed/skipped |
| Frontend clean install / format / lint | Passed; zero lint warnings/errors |
| Vitest / React Testing Library | 204 passed across 14 files |
| TypeScript / Vite production build | Passed |

Coverage includes trusted role/creator/author identity, full assignment/legacy permissions, mutation-free forbidden/version failures, safe DTOs/errors, comment rollback/version preservation, additive migrations, and deterministic frontend session/navigation/mutation races. Stage 4F strengthened twelve expectedVersion validation cases and added two HTTP invalid-status cases; Initial Linux CI exposed six assertions comparing 100-nanosecond response timestamps with PostgreSQL microsecond timestamps. Stage 4G corrected these test assertions to normalize only response-to-storage comparisons, compare rollback against the exact persisted baseline, and exercise a seventh fractional digit in the existing ordering test. No product source changed; all 135 integration cases pass locally and in Linux CI.

## Postman, manual QA, bugs, and traceability

The [collection](../postman/FlowOps.postman_collection.json) has eight folders, 49 requests, and 123 named assertions. The official v2.1 schema validates, all 51 scripts parse, and 25 environment variables contain placeholders/empty captured values only. Stage 4G freshly executed the actual request bodies, auth overrides, pre-request hooks, and assertions against the real API/disposable PostgreSQL using an equivalent Node executor: **49 requests / 123 assertions passed**. Native Postman/Newman execution and desktop GUI import were not observed. Successful item mutations capture server versions, comments preserve the normal version variable, and stale snapshots remain separate. See [Postman guide](../qa/postman-guide.md).

The [manual suite](../qa/manual-test-cases.md) contains **28 designed cases**; the fresh smoke is separate evidence and does not mark every case executed. [Six resolved development bugs](../qa/bug-reports.md) cite real history/regressions without invented production impact. [Traceability](../qa/traceability.md) maps **27 business requirements**, including explicit limits for fault injection, server-load races, migration rollback, and rendered focus/layout. Final auditing resolved local links, unique IDs, 18 historical bug commit references, 78 backend method references, and collection request names.

## Fresh browser, mobile, and keyboard evidence

On the Stage 4F implementation baseline, **34/34 fresh checks passed** in Chromium 151.0.7922.34 at 1440 × 1000 desktop and 390 × 844 mobile against the real .NET API and a zero-to-latest disposable PostgreSQL database. Fresh private Admin and two Members exercised registration/login/me/reload/logout, generic failures, role-spoof rejection, creator/assignee/Admin permissions, direct forbidden calls with session retention, assignment/legacy rules, two-session stale edit and assignment 409 with explicit refresh/retry, authenticated ordered comments/activity, unchanged version/timestamp, and an open edit during another comment. Mobile login/register/cards/detail/assignment/comments/navigation, native-select Tab/Enter, menu/modal focus trapping/restoration, long escaped text, and no horizontal overflow were verified. Real invalid `/auth/me` and comment POST returned 401 through central invalidation. Expired JWT rejection also remains covered by PostgreSQL tests.

There were zero unexpected runtime/console errors and zero intercepted responses; deliberate real 400/401/403/409 diagnostics are recorded separately. All six sanitized screenshots were visually inspected. The smoke is separate from the 28 designed manual case IDs, and no Safari/Firefox coverage is claimed. Owned API/Vite/browser processes and disposable databases were removed; developer data stayed unchanged.

## Security and delivery hygiene

The full Phase 4 change was inspected across 128 changed files, including generated EF model files, tests, documentation, and Postman assets. Domain/Application boundaries hold, server controls remain authoritative, and no release-blocking correctness/security defect was found. Current tracked-content secret review inspected 213 text files and classified 39 pattern matches as fake fixtures, disposable local/CI defaults, validation text, or placeholders: zero real tracked-secret findings. Password hashes/security stamps are schema properties only, never literal exported user data or DTO fields. No production credential/token logging, client-trusted author/creator, role escalation, debug bypass, machine-specific path, temporary QA endpoint, screenshot/build artifact, or unrelated large file was found.

The sealed Codex Security diff scan covers the exact main → `5467b84` implementation range and reports zero findings. Its checkpoint merger retained an earlier frontend-pending note, so canonical coverage remains marked partial despite the final inventory and delegated review covering all 101 changed source files. This reporting caveat is preserved; no complete-coverage clean-scan claim is made. Secret review covers current tracked content, not every historical Git object or every possible secret format. Stage 4G documentation and the focused timestamp-precision test correction are separately reviewed; the sealed scan remains tied to its original implementation range. Disposable QA servers/databases were removed; ephemeral credentials/signing keys stayed in private runtime memory. Phase 5 is untouched.

## Historical checkpoints

| Checkpoint | Unit / PostgreSQL / frontend | Recorded Chromium evidence |
|---|---|---|
| Stage 4A | 52 / 53 / unchanged | Backend foundation |
| Stage 4B | 80 / 100 / 27 | Backend authorization |
| Stage 4C | 82 / 102 / 115 | 17 checks |
| Stage 4D | 82 / 102 / 166 | 23 checks |
| Stage 4E | 110 / 133 / 204 | 20 checks |
| Stage 4F | 110 / 135 / 204 | Prior browser evidence retained; 49/123 equivalent API run |

These remain historical observations rather than newly executed manual cases. Stage 4C's final audit corrected the legacy Member self-assignment boundary in `565800e`, with current/stale denial before writes and relocking after Admin assignment/unassignment. Stage 4D's real browser QA discovered modal focus restoration failure; `22d72e0` and `4db1267` provide an explicit trigger reference, stable close callback, delayed Activity/close-unlock coordination, three regressions, and actual Escape/save focus verification. Stage 4E verified two comment authors, rollback, open-edit version compatibility, escaped text, local retries, and mobile keyboard wrapping. Historical checkpoint reports and git history retain the original detailed evidence.

## Known limitations and deferred scope

No refresh token, revocation, server logout, or client idle-expiry timer exists. Issued JWT claims remain valid until expiry, including after role/account changes; login and `/auth/me` check active state. SessionStorage remains exposed to same-origin XSS. Comments are plain text and unpaginated, with no edit/delete/replies, notifications, rich text, or realtime transport. Local rendered QA covers Chromium only; no Safari/Firefox or production deployment claim is made. Native Postman/Newman and desktop import remain unobserved. Dashboard/UX/Figma work belongs to Phase 5.

## Delivery

All local acceptance gates passed on 2026-09-30. Branch: `feature/phase-4-auth-collaboration-qa`. [PR #5](https://github.com/Ahmaddaghra/flowops/pull/5) is open against `main` and remains unmerged. The focused CI correction is commit `1cad82bc3ac7d458b1a8ef136acafd1a2fcae4fd`; [Backend CI](https://github.com/Ahmaddaghra/flowops/actions/runs/36762024723) (both unit/build and PostgreSQL jobs) and [Frontend CI](https://github.com/Ahmaddaghra/flowops/actions/runs/36762024712) passed on that exact head. The final documentation commit is checked again before delivery, with its exact SHA and run URLs recorded in the PR and final report.

[Codex review was requested](https://github.com/Ahmaddaghra/flowops/pull/5#issuecomment-5917057652). The [connector response](https://github.com/Ahmaddaghra/flowops/pull/5#issuecomment-5917060238) reports exhausted code-review usage. No completed Codex review or review findings were returned. This is a known review limitation, not a clean-review result. Technical gates pass; human review remains recommended before merge. No merge is authorized or performed; Phase 5 remains untouched.
