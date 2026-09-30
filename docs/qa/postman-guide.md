# Authenticated Postman QA

This collection verifies the implemented Stages 4A–4E contracts through eight ordered folders and 49 requests. It uses two Members and an independently configured Admin, then exercises lifecycle changes, assignment, comments, activity, validation, authorization and stale versions. Run it against a disposable PostgreSQL database, never the developer database.

## Prerequisites and API startup

- .NET 10, PostgreSQL, the EF Core CLI and Postman are available locally.
- Use the existing setup in [backend/README.md](../../backend/README.md) for private JWT configuration. A signing key must contain at least 32 UTF-8 bytes. No signing key belongs in Postman.
- Create a separate database such as `flowops_stage4f_qa`. The connecting PostgreSQL account must be able to migrate that database.
- Choose three distinct test email addresses and private throwaway passwords. Passwords require at least eight characters, uppercase, lowercase and a digit. The `.invalid` addresses in the environment are placeholders; FlowOps does not require email delivery.

From the repository root, set the connection explicitly before migrations and API startup. Replace the connection placeholders with your isolated local database configuration:

```bash
export ConnectionStrings__DefaultConnection='Host=localhost;Database=flowops_stage4f_qa;Username=CHANGE_ME;Password=CHANGE_ME'

dotnet restore backend/FlowOps.sln
dotnet ef database update \
  --project backend/src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj \
  --startup-project backend/src/FlowOps.Api/FlowOps.Api.csproj
```

Configure `Jwt:SigningKey` privately using the backend guide. Create the test Admin through the existing **Development-only** bootstrap by privately setting all three values:

- `FLOWOPS_SEED_ADMIN_EMAIL`
- `FLOWOPS_SEED_ADMIN_PASSWORD`
- `FLOWOPS_SEED_ADMIN_DISPLAY_NAME`

Use an Admin email different from both Members. Public registration always creates Member and cannot promote an existing account; the bootstrap also refuses to promote an existing Member. Start the API:

```bash
ASPNETCORE_ENVIRONMENT=Development \
dotnet run \
  --project backend/src/FlowOps.Api/FlowOps.Api.csproj \
  --no-launch-profile \
  --urls http://localhost:5055
```

After the Admin exists, stop the API, remove the three bootstrap credentials from its private configuration, and restart it with the same database and JWT key. This keeps those bootstrap credentials out of the running API environment. The Admin remains persisted. If user-secrets supplied the values, remove them there rather than only unsetting shell variables.

Public `GET http://localhost:5055/api/v1/health` should return 200. Swagger is available at `/swagger` in Development. The collection itself does not start, migrate or seed the server.

## Import and private environment setup

Import both files:

- [FlowOps.postman_collection.json](../postman/FlowOps.postman_collection.json)
- [FlowOps.local.postman_environment.json](../postman/FlowOps.local.postman_environment.json)

Select **FlowOps Local QA (placeholders only)**. In your private local environment, replace the three password placeholders, set the two Member emails, and set Admin email/password to the account you bootstrapped. Keep the identities distinct. Leave tokens and resource IDs empty; successful responses fill them. The password and token variables are marked secret for display masking, which does not make environment exports safe to publish.

`CHANGE_ME` is intentionally not a usable test password. Do not export or commit a populated environment, runner data file or console log containing credentials, tokens or Authorization values. The committed environment contains only `.invalid` email placeholders, empty token slots, non-secret fixture GUIDs and `CHANGE_ME` password placeholders. Scripts never print tokens.

## Run order and request names

Use Collection Runner with **one iteration**, preserving this order. Running a later folder independently requires the identities and item state established by its predecessors. Every intentional negative request has a matching expected-status assertion; red HTTP status codes are not failed tests by themselves.

| Order | Folder | Purpose |
|---|---|---|
| 1 | Authentication | Register both Members, login all three identities, verify `/auth/me`, reject client role selection |
| 2 | Users | Verify authenticated active-user summaries contain only ID/display name |
| 3 | Work Items | List categories, create an unassigned Member-owned item, read/query it, edit and move to InProgress |
| 4 | Assignment | Second Member self-assignment and assignee edit, self-unassignment, Admin assignment/reassignment/edit/status/unassignment |
| 5 | Comments | Empty list, two authenticated authors, trimming/order, unchanged persisted WorkItem version |
| 6 | Activity | Trusted creator/assignment/comment actors and separate `CommentAdded` descriptions |
| 7 | Negative Authorization | Expected 401/403/400/404 responses without replacing successful variables |
| 8 | Concurrency / Conflict Cases | Separate stale snapshot, winning edit, stale edit/assignment 409, surviving winner, invalid transition 409 |

### Authentication

1. Register Member
2. Register second Member
3. Login Member
4. Login second Member
5. Login Admin
6. Get current Member
7. Reject role selection at registration

The two registration requests expect 201 and prove the issued role is Member rather than Admin. The last request deliberately adds `role` to the strict registration DTO and expects 400. The default collection bearer is `memberToken`; public authentication requests explicitly use no auth. Second Member and Admin requests override the bearer variable. No request provides creator or activity actor identity.

### Users and Work Items

- Users: **List active user summaries**.
- Work Items, in order: **List active categories**, **Create work item**, **List work items**, **Get work item detail**, **Creator edits details**, **Creator moves to InProgress**, **Search and filter work items**.

Categories are authenticated and the first returned active ID becomes `categoryId`. Creation sends `assigneeUserId: null`; the server derives `createdByUserId` from Member A. Descriptive edits send title, description, priority, category and the captured expectedVersion. Search/filter requests exercise server-side search, category/status/priority filters, sorting and pagination. Current/historical assignee-filter edge cases remain covered by automated and manual tests.

### Assignment

1. Second Member self-assigns
2. Assignee edits details
3. Second Member self-unassigns
4. Admin assigns Member
5. Admin reassigns second Member
6. Admin edits details
7. Admin moves to Blocked
8. Admin unassigns

Requests send only `{ assigneeUserId, expectedVersion }`, using real captured user IDs. The unrelated second Member may self-assign this eligible unassigned user-backed item, then gains assignee edit rights. Self-unassignment removes those rights. Admin can assign/reassign/unassign and override lifecycle permissions. The folder finishes with an unassigned, Blocked item, so Member B is unrelated again for later 403 cases.

Historical null-creator/null-assignee items remain Admin-only for lifecycle mutation; their names grant no rights. That fixture boundary is covered by PostgreSQL tests and `AUTHZ-007` in the manual suite, rather than fabricated through a public API that cannot create a legacy record.

### Comments and Activity

Comments, in order: **Get comments empty**, **Member adds trimmed comment**, **Second Member adds comment**, **Get ordered comments**, **Verify comments preserve WorkItem version**. Activity then runs **Get authenticated activity history**.

Comment POST sends only `{ body }`. The server trims it, derives author from JWT/current user, and returns the new comment with safe ID/display-name author information. No author, timestamp, role, WorkItem ID or expectedVersion is submitted. Both Members can comment, including the unrelated Member with no lifecycle edit permission. GET comments is oldest-first (`CreatedAtUtc`, then ID), and the sequential fixture asserts both returned IDs in their expected order.

`commentWorkItemVersion` captures the version before comments. POST tests ensure the normal version variable is untouched; the final detail GET proves the persisted WorkItem version also remains unchanged. That verification GET deliberately does not update `workItemVersion`. Activity asserts both authenticated comment actors and concise `Comment added` descriptions rather than duplicating comment bodies. Transaction rollback and safe author fallback are proven by focused unit/PostgreSQL tests; ordinary collection requests do not simulate database faults.

### Negative Authorization

| Request | Expected |
|---|---|
| Wrong password | 401, generic `Invalid email or password.` |
| Anonymous protected request | 401 |
| Malformed bearer token | 401 |
| Unrelated Member edit forbidden | 403 |
| Unrelated Member status forbidden | 403 |
| Member assigning another user forbidden | 403 |
| Blank title | 400 |
| Invalid priority | 400 |
| Invalid status | 400 |
| Blank comment | 400 |
| Too-long comment | 400 for a generated 2001-character body |
| Invalid expectedVersion | 400 with an expectedVersion error; assignment body otherwise valid |
| Missing work item | 404 |
| Missing category | 404 |

The malformed bearer is an obvious invalid test string. Wrong password is attempted only once per normal run. Repeated failed login requests can trigger the existing five-attempt, 15-minute lockout; use a valid login between ordinary reruns or a fresh test identity. Negative responses never replace captured auth tokens or versions. Strict comment author/timestamp/route spoof attempts are already automated in `CommentsApiTests`, and registration role spoofing is represented directly in this collection.

### Concurrency / Conflict Cases

1. **Capture stale WorkItem snapshot** stores Version N separately in `staleWorkItemVersion`.
2. **Winning detail mutation** changes only title using current N, asserts N+1, and updates `workItemVersion` to that successful response.
3. **Stale detail mutation conflicts** sends stale N and expects `Work Item Concurrency Conflict` / 409.
4. **Stale assignment conflicts** uses authorized Admin assignment with stale N and expects the same 409.
5. **Verify winning state survives** proves the winning title/version remain, with no stale assignment applied.
6. **Invalid same-state transition conflicts** sends current Blocked → Blocked with the current version and expects `Invalid Work Item Transition` / 409.

The stale variable never overwrites the current version. A conflict requires review/explicit refresh rather than a blind retry. Normal no-op descriptive/assignment requests need not increment a version, so the happy-path fixtures deliberately make real changes. Multiple descriptive field changes can increment WorkItem version more than once; only the title-only winning fixture assumes N+1.

## Variable lifecycle

| Variables | How populated / used |
|---|---|
| `baseUrl` | Non-secret API base, default `http://localhost:5055/api/v1` |
| `memberEmail`, `memberPassword`, second Member equivalents, Admin equivalents | Enter privately; Admin exists before running |
| `memberToken`, `secondMemberToken`, `adminToken` | Captured only from successful register/login responses; never logged |
| `memberUserId`, `secondMemberUserId`, `adminUserId` | Captured from successful auth responses, used as assignment targets and author/actor assertions |
| `categoryId` | First active category returned by the authenticated categories request |
| `workItemId`, `workItemVersion`, `workItemStatus` | Captured from successful item creation/read/mutations; error responses and comment responses never replace them |
| `commentWorkItemVersion`, `firstCommentId`, `secondCommentId` | Comment baseline and returned comment IDs, separate from lifecycle version |
| `staleWorkItemVersion`, `winningWorkItemTitle` | Independent stale snapshot and winning-state assertions |
| `tooLongCommentBody` | Pre-request script generates 2001 `x` characters; contains no credential data |
| `missingWorkItemId`, `missingCategoryId` | All-`f` fixture GUIDs, assumed absent from the disposable database |

The scripts use standard `pm.environment`, `pm.test`, `pm.expect`, and response status/header/JSON APIs. They do not send extra requests, choose execution order, print tokens, or implement authorization themselves.

## Reset and rerun

For a complete fresh run, stop the QA API, recreate only your disposable QA database, reapply migrations, bootstrap the Admin again and rerun all eight folders. Clear token/ID/version variables in your private environment before using a newly reset database. Never drop or migrate the developer database as a collection reset.

To reuse the same database/accounts, keep the credentials but uncheck **Register Member** and **Register second Member** in Collection Runner. Login requests refresh tokens and IDs; **Create work item** creates a fresh item and replaces the resource variables. Run the remaining requests in their original order once. The fresh item makes empty comments, permissions, status and stale-version setup repeatable. Old QA items remain in the disposable database until it is removed.

Alternatively, supply two new Member email addresses and run both registration requests again. Reusing an email with registration deliberately returns 400; do not treat that duplicate-account response as a successful registration test. To rerun the Comments or Conflict folders alone, first create/reset an item through the preceding happy-path folders so their starting-state assumptions hold.

The API has no logout endpoint or token revocation service in Phase 4. Browser logout clears the frontend session; issuing a previously valid bearer directly remains governed by the existing token expiry. Collection login refreshes tokens after expiry. Browser session/401/403 handling is covered separately by frontend tests and manual cases.

## Validation and evidence limits

Postman JSON syntax and the official collection v2.1 schema are checked during Stage 4F. If an existing Postman CLI/Newman runner is available, the collection can be run directly against the QA server. No repository dependency is added solely to run it. When such a runner is unavailable, the Stage 4F checkpoint distinguishes equivalent API/script execution from native Postman/Newman execution; it does not claim a Postman desktop import that was not observed.

Current execution results, test totals, limitations and checkpoint status are recorded in the [Phase 4 document](../phases/phase-4-auth-collaboration-qa.md). Use the [manual suite](manual-test-cases.md), [resolved defect reports](bug-reports.md) and [traceability matrix](traceability.md) for UI/accessibility checks and requirements that need deeper automated evidence. Stage 4F does not start Stage 4G, Phase 5 or PR delivery.
