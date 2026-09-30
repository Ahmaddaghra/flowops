# API Design

## Implemented API (v1)

The API is rooted at `/api/v1`. Request and response bodies use JSON. Swagger UI is available at `/swagger` in Development and supports JWT bearer authorization. Health, registration, and login are public. All other implemented endpoints below require an authenticated Admin or Member.

| Method | Route | Behavior | Responses |
|---|---|---|---|
| `GET` | `/api/v1/health` | Reports API health | `200` |
| `POST` | `/api/v1/auth/register` | Registers a Member and returns an access token/user | `201`, `400` |
| `POST` | `/api/v1/auth/login` | Validates credentials and returns an access token/user | `200`, `400`, `401` |
| `GET` | `/api/v1/auth/me` | Returns the authenticated user's safe identity information | `200`, `401` |
| `GET` | `/api/v1/users` | Lists active users' IDs/display names for assignment | `200`, `401` |
| `GET` | `/api/v1/categories` | Lists active categories | `200`, `401` |
| `GET` | `/api/v1/work-items` | Searches, filters, sorts, and pages work items | `200`, `400`, `401` |
| `POST` | `/api/v1/work-items` | Creates a Todo work item owned by the current user and its Created activity event | `201`, `400`, `401`, `403`, `404` |
| `GET` | `/api/v1/work-items/{id}` | Reads a work item | `200`, `401`, `404` |
| `PATCH` | `/api/v1/work-items/{id}` | Authorized descriptive field update | `200`, `400`, `401`, `403`, `404`, `409` |
| `POST` | `/api/v1/work-items/{id}/status` | Authorized status transition | `200`, `400`, `401`, `403`, `404`, `409` |
| `POST` | `/api/v1/work-items/{id}/assign` | Assigns/unassigns a real user under the assignment policy | `200`, `400`, `401`, `403`, `404`, `409` |
| `GET` | `/api/v1/work-items/{id}/activity` | Lists newest-first activity with safe actor summaries | `200`, `401`, `404` |
| `GET` | `/api/v1/work-items/{id}/comments` | Lists oldest-first comments with safe author summaries | `200`, `401`, `404` |
| `POST` | `/api/v1/work-items/{id}/comments` | Adds an authenticated comment and its activity atomically | `201`, `400`, `401`, `404` |

### Authentication

Registration accepts `email`, `password`, and `displayName` (trimmed, required, maximum 100 characters). It always creates a Member; unknown JSON properties such as a submitted `role` are rejected with `400`. Registration returns `201` with a Location for `/auth/me`; login returns `200` and accepts only `email` and `password`. The password policy requires a minimum of eight characters, uppercase, lowercase, and a digit, with special characters optional. Email addresses are unique. Five failed access attempts cause a 15-minute lockout.

Both successful auth operations return:

```json
{
  "accessToken": "<access-token>",
  "expiresAtUtc": "2026-09-30T12:00:00Z",
  "user": {
    "id": "20000000-0000-0000-0000-000000000001",
    "email": "member@example.com",
    "displayName": "Member",
    "roles": ["Member"]
  }
}
```

`GET /auth/me` returns the safe user object. No endpoint returns password hashes, security stamps, or full Identity entities. `GET /users` returns only `{ "id": "...", "displayName": "..." }` summaries for active assignment targets. Lockout does not deactivate a user; active assignment eligibility is a separate user flag.

Protected calls send `Authorization: Bearer <accessToken>`. Missing, expired, or malformed tokens return `401`; failed login uses the generic `Invalid email or password.` message. Authenticated callers without permission receive `403` and should remain logged in. Claims include `sub`, `email`, `name`, `role`, and `jti`. Access tokens default to 60 minutes and there is no refresh or revocation service in Phase 4.

### Work item authorization

| Operation | Admin | Member |
|---|---|---|
| Read items, categories, activity, and comments | Allowed | Allowed |
| Add comments to a readable item | Allowed | Allowed |
| Create | Allowed; current user is creator | Allowed; current user is creator |
| Edit details or change status | Any item | Creator or current user assignee |
| Assign an unassigned item | Any active user | Self only when the item has a creator user ID |
| Reassign an assigned item | Any active user | Forbidden |
| Unassign | Any item | Only an item currently assigned to self |

A legacy item with both `createdByUserId` and `assigneeUserId` null permits lifecycle edits, status changes, and assignment only by Admin. A Member cannot self-assign it. After an Admin legitimately assigns an active user, that assignee gains ordinary assignee permissions. If the assignment is removed while the creator remains null, the Admin-only boundary applies again. A legacy display-name match never grants ownership. Existing-item lifecycle mutations require `expectedVersion`. Comments follow the authenticated read boundary, including for legacy items, and require no expectedVersion.

Work item responses include nullable `createdByUserId` and `assigneeUserId`, nullable `createdBy`/`assignee` summaries (`id`, `displayName`), and server-computed `permissions`: `canEdit`, `canChangeStatus`, `canAssign`, `canSelfAssign`, `canUnassign`, and `canAssignOthers`. These flags guide UX; the server rechecks every mutation. `legacyAssigneeName` preserves the old Phase 3 snapshot. Compatibility field `assigneeName` resolves the current user's display name first, otherwise the legacy snapshot; it is not an authorization input and may show historical text even after a user-backed assignment is later removed.

### List query parameters

- `search`: case-insensitive partial match against title, description, or current user assignee display name; legacy assignee snapshot is searched only when no user is assigned (maximum 200 characters)
- `status`: `Todo`, `InProgress`, `Blocked`, or `Done`
- `priority`: `Low`, `Medium`, `High`, or `Critical`
- `categoryId`: category GUID
- `assignee`: case-insensitive partial match against the current user assignee display name, falling back to legacy snapshot only when no user is assigned
- `page`: one-based page number; defaults to `1`
- `pageSize`: `1`–`100`; defaults to `20`
- `sort`: `createdAt`, `updatedAt`, `title`, `priority`, or `status`; defaults to `createdAt`
- `direction`: `asc` or `desc`; defaults to `desc`

The response wraps the items with pagination metadata:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "totalItems": 0,
  "totalPages": 0
}
```

### Request examples

Create a work item:

```json
{
  "title": "Investigate intermittent login failures",
  "description": "Review the authentication service logs.",
  "priority": "High",
  "categoryId": "10000000-0000-0000-0000-000000000002",
  "assigneeUserId": null
}
```

The server sets `createdByUserId` from the authenticated context. An optional initial `assigneeUserId` follows the assignment policy: a Member may select themselves and an Admin may select any active user. Create and assignment requests reject unknown JSON properties, including a client-supplied creator ID or legacy `assigneeName`. An empty GUID assignment target returns `400`; a missing/inactive user target returns `404` after authorization and version checks.

Update descriptive fields using the version from the representation being edited:

```json
{
  "title": "Investigate intermittent login failures",
  "description": "New details",
  "priority": "High",
  "categoryId": "10000000-0000-0000-0000-000000000002",
  "expectedVersion": 1
}
```

Every work item response (list, detail, create, edit, status, and assignment) includes a positive `version`. Create returns `version: 1` and requires no `expectedVersion`. PATCH, status, and assignment requests require `expectedVersion >= 1`; missing, zero, negative, or invalid values return `400` Validation Problem Details. Versions may advance more than once when an edit changes several fields, so clients must use the returned version rather than incrementing a local counter.

Change status:

```json
{ "status": "InProgress", "expectedVersion": 1 }
```

Assign using an active user's ID, or unassign by sending a null `assigneeUserId`:

```json
{ "assigneeUserId": null, "expectedVersion": 1 }
```

Stage 4D's client sends this exact assignment body, never display names or creator IDs. A directory-capable caller lazily opens Change assignment to select an active `{ id, displayName }` user; permitted self-assignment sends the verified current user's ID, and unassignment sends null. Creation remains unassigned with `assigneeUserId: null`. Server capabilities drive visible edit/status/assignment controls, and missing/null capabilities fail closed. Successful mutations replace the current item using the returned version and capabilities; subsequent calls use that server version. Edit/status/assignment are serialized within the detail page.

The shared detail/list display shows a current assignee's real name first, Assigned user unavailable when an assignment ID has no summary, Historical assignment: NAME when only legacy text remains, and Unassigned otherwise. The existing name filter matches current user display names or the historical snapshot when no user is assigned. Compatibility `assigneeName` never supplies identity or permissions.

### Lifecycle rules

| Current status | Allowed next statuses |
|---|---|
| `Todo` | `InProgress`, `Blocked` |
| `InProgress` | `Blocked`, `Done` |
| `Blocked` | `InProgress`, `Todo` |
| `Done` | None |

The server enforces transitions and returns `409 Conflict` for a transition that violates these rules. Self-transitions are invalid, including `Done` → `Done`. The UI requests the transition; it does not define the authoritative rule.

### Work item comments

`GET /api/v1/work-items/{id}/comments` returns an array, including `[]` for an existing item with no comments. Ordering is explicitly `CreatedAtUtc ASC`, then `Id ASC`. All authenticated Admin/Member callers can read and comment on every currently readable work item; creator/assignee capabilities and the legacy lifecycle restriction do not gate comments.

`POST /api/v1/work-items/{id}/comments` accepts exactly:

```json
{ "body": "Investigated the customer report." }
```

Body is required, must not be whitespace-only, and may contain at most 2000 characters before trimming leading/trailing whitespace. Internal newlines are preserved. The strict DTO rejects unknown fields with `400`, including `authorUserId`, `author`, `createdAtUtc`, `role`, `workItemId`, and `expectedVersion`. The resource ID comes from the route, authorship from `ICurrentUser.UserId`, and timestamp from server UTC time.

POST returns `201` and a Location for the item's comments GET, with this safe shape:

```json
{
  "id": "30000000-0000-0000-0000-000000000001",
  "workItemId": "40000000-0000-0000-0000-000000000001",
  "body": "Investigated the customer report.",
  "createdAtUtc": "2026-09-30T12:00:00Z",
  "author": {
    "id": "20000000-0000-0000-0000-000000000001",
    "displayName": "Member"
  }
}
```

Author summaries contain only ID and display name, with `User unavailable` if a summary cannot be resolved. Lists batch distinct author IDs through the existing user-directory abstraction. No email, roles, or Identity security fields are exposed. Inactive historical authors retain their names through that directory.

One `SaveChangesAsync` persists the comment and `CommentAdded` activity in one EF transaction. The event uses the current user's actor ID and description `Comment added`; it never copies the body. A failure persists neither row. Adding a comment leaves `WorkItem.Version` and `UpdatedAtUtc` unchanged, so an edit opened at version N can still submit N after another user comments. POST has no expectedVersion check and introduces no ordinary-comment `409` response.

Anonymous/invalid-session calls return `401`, missing items return `404`, and invalid bodies return `400` Problem Details. The existing read policy permits both roles, so ordinary Admin/Member comment calls do not introduce a creator/assignee `403`. Existing JWT semantics remain: issued valid claims authorize work item reads until expiry; login and `/auth/me` check account activity. Comments add no account-state workaround or token revocation.

The UI appends the returned comment and refreshes Activity without reloading detail. Comments support loading, empty, isolated error/retry, and submitting states, retained failed drafts, accessible validation, and route-scoped stale-response guards. Bodies render as escaped plain text. No comment editing, deletion, replies, reactions, mentions, attachments, rich text, notifications, or real-time transport are implemented.

### Error responses

Errors use RFC 7807 Problem Details with `application/problem+json`. Data annotation and query validation failures return `400` with field errors. Missing work items, categories, or assignment targets return `404`. Invalid lifecycle transitions return `409` with title `Invalid Work Item Transition`. Authentication failures return `401`; authenticated permission failures return `403`. No error exposes stack traces or Identity security metadata.

Optimistic concurrency has two checks. After locating the item and authorizing the operation, the application compares `expectedVersion` with the current tracked WorkItem's `Version` before any domain mutation, activity staging, or save. Forbidden operations never mutate, stage activity, or save, even when the submitted version is stale. An allowed stale request returns `409`. EF Core also retains the originally loaded `Version` in the UPDATE predicate, protecting the race between server load and save.

Both conflicts return `409` with title `Work Item Concurrency Conflict` and detail `This work item was modified by another request. Refresh it and try again.` Conflict responses contain no version values, EF/SQL details, or stack traces. The UI distinguishes this from an invalid status transition, retains a failed edit's form values, and does not retry automatically. Clients should refresh and review the latest representation before retrying with its version; they must not blindly fetch a newer token and replay stale values.

### Activity history

Create, title, description, priority, category, status, and assignment changes produce activity events in the same `SaveChanges` as the associated work item change. An `expectedVersion` mismatch stages no mutation or event and does not call `SaveChanges`. EF Core's transaction rolls back both the mutation and staged activity when a race fails the database version check; a stale request cannot leave a ghost event. No-op descriptive updates do not add events. New events take `actorUserId` from authenticated context and include an `actor` summary (`id`, `displayName`) plus `actorDisplayName` in responses. Legacy events retain null actors and `actorDisplayName: "System"`; historical events are not rewritten. Comment creation also records `CommentAdded` in the same save as its Comment, with authenticated actor and `Comment added` description; the work item itself is not mutated.

## Scope deferred to later phases

The reviewed Stage 4A/4B backend foundation is used by Stage 4C's authenticated React client and Stage 4D's capability-driven assignment/edit/status controls. Client route/session guards provide UX; the backend remains authoritative for authentication and every operation's permissions. Mutation `403` preserves authentication and current item state, with a visible permission error and no automatic refresh. A stale `409` requires manual refresh/review and never retries automatically. Protected `401` retains the centralized matching-session invalidation behavior. Stage 4E comments are completed and verified. Stage 4F adds authenticated Postman workflows and manual QA/defect/traceability artifacts; see the [QA guide](qa/postman-guide.md). The placeholder-only collection follows the current user-ID assignment and body-only comments contracts. Stage 4G local gates and the fresh 34-check browser smoke pass; [Phase 4](phases/phase-4-auth-collaboration-qa.md) records PR/CI/review delivery status. Dashboard summaries belong to Phase 5.
