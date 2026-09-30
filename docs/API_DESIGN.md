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
| Read items, categories, and activity | Allowed | Allowed |
| Create | Allowed; current user is creator | Allowed; current user is creator |
| Edit details or change status | Any item | Creator or current user assignee |
| Assign an unassigned item | Any active user | Self only when the item has a creator user ID |
| Reassign an assigned item | Any active user | Forbidden |
| Unassign | Any item | Only an item currently assigned to self |

A legacy item with both `createdByUserId` and `assigneeUserId` null permits every work item mutation, including assignment, only by Admin. A Member cannot self-assign it. After an Admin legitimately assigns an active user, that assignee gains ordinary assignee permissions. If the assignment is removed while the creator remains null, the Admin-only boundary applies again. A legacy display-name match never grants ownership. Any existing-item mutation requires `expectedVersion`.

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

### Error responses

Errors use RFC 7807 Problem Details with `application/problem+json`. Data annotation and query validation failures return `400` with field errors. Missing work items, categories, or assignment targets return `404`. Invalid lifecycle transitions return `409` with title `Invalid Work Item Transition`. Authentication failures return `401`; authenticated permission failures return `403`. No error exposes stack traces or Identity security metadata.

Optimistic concurrency has two checks. After locating the item and authorizing the operation, the application compares `expectedVersion` with the current tracked WorkItem's `Version` before any domain mutation, activity staging, or save. Forbidden operations never mutate, stage activity, or save, even when the submitted version is stale. An allowed stale request returns `409`. EF Core also retains the originally loaded `Version` in the UPDATE predicate, protecting the race between server load and save.

Both conflicts return `409` with title `Work Item Concurrency Conflict` and detail `This work item was modified by another request. Refresh it and try again.` Conflict responses contain no version values, EF/SQL details, or stack traces. The UI distinguishes this from an invalid status transition, retains a failed edit's form values, and does not retry automatically. Clients should refresh and review the latest representation before retrying with its version; they must not blindly fetch a newer token and replay stale values.

### Activity history

Create, title, description, priority, category, status, and assignment changes produce activity events in the same `SaveChanges` as the associated work item change. An `expectedVersion` mismatch stages no mutation or event and does not call `SaveChanges`. EF Core's transaction rolls back both the mutation and staged activity when a race fails the database version check; a stale request cannot leave a ghost event. No-op descriptive updates do not add events. New events take `actorUserId` from authenticated context and include an `actor` summary (`id`, `displayName`) plus `actorDisplayName` in responses. Legacy events retain null actors and `actorDisplayName: "System"`; historical events are not rewritten.

## Scope deferred to later phases

The reviewed Stage 4A/4B backend foundation is used by Stage 4C's authenticated React client and Stage 4D's capability-driven assignment/edit/status controls. Client route/session guards provide UX; the backend remains authoritative for authentication and every operation's permissions. Mutation `403` preserves authentication and current item state, with a visible permission error and no automatic refresh. A stale `409` requires manual refresh/review and never retries automatically. Protected `401` retains the centralized matching-session invalidation behavior. Stage 4D is completed and verified. Comment persistence/API, expanded authenticated Postman workflows, and remaining manual QA/traceability artifacts are pending later Phase 4 stages. The Postman collection still represents the Phase 3 unauthenticated workflow. Dashboard summaries belong to Phase 5.
