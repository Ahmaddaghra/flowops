# API Design

## Implemented API (v1)

The API is rooted at `/api/v1`. Request and response bodies use JSON. Swagger UI is available at `/swagger` in Development.

| Method | Route | Behavior | Responses |
|---|---|---|---|
| `GET` | `/api/v1/health` | Reports API health | `200` |
| `GET` | `/api/v1/categories` | Lists active categories | `200` |
| `GET` | `/api/v1/work-items` | Searches, filters, sorts, and pages work items | `200`, `400` |
| `POST` | `/api/v1/work-items` | Creates a Todo work item and its Created activity event | `201`, `400`, `404` |
| `GET` | `/api/v1/work-items/{id}` | Reads a work item | `200`, `404` |
| `PATCH` | `/api/v1/work-items/{id}` | Updates title, description, priority, and category | `200`, `400`, `404`, `409` |
| `POST` | `/api/v1/work-items/{id}/status` | Requests an allowed status transition | `200`, `400`, `404`, `409` |
| `POST` | `/api/v1/work-items/{id}/assign` | Assigns or unassigns a display name | `200`, `400`, `404`, `409` |
| `GET` | `/api/v1/work-items/{id}/activity` | Lists newest-first activity events | `200`, `404` |

### List query parameters

- `search`: case-insensitive partial match against title, description, or assignee name (maximum 200 characters)
- `status`: `Todo`, `InProgress`, `Blocked`, or `Done`
- `priority`: `Low`, `Medium`, `High`, or `Critical`
- `categoryId`: category GUID
- `assignee`: case-insensitive partial match against the assignee display name
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
  "assigneeName": "Ahmad"
}
```

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

Unassign by sending a null or empty `assigneeName`:

```json
{ "assigneeName": null, "expectedVersion": 1 }
```

### Lifecycle rules

| Current status | Allowed next statuses |
|---|---|
| `Todo` | `InProgress`, `Blocked` |
| `InProgress` | `Blocked`, `Done` |
| `Blocked` | `InProgress`, `Todo` |
| `Done` | None |

The server enforces transitions and returns `409 Conflict` for a transition that violates these rules. Self-transitions are invalid, including `Done` → `Done`. The UI requests the transition; it does not define the authoritative rule.

### Error responses

Errors use RFC 7807 Problem Details with `application/problem+json`. Data annotation and query validation failures return `400` with field errors. Missing work items or categories return `404`. Invalid lifecycle transitions return `409` with title `Invalid Work Item Transition`.

Optimistic concurrency has two checks. The application compares `expectedVersion` with the current tracked WorkItem's `Version` before any domain mutation, activity staging, or save. This rejects an old browser page even when another write finished before its request began. EF Core also retains the originally loaded `Version` in the UPDATE predicate, protecting the race between server load and save.

Both conflicts return `409` with title `Work Item Concurrency Conflict` and detail `This work item was modified by another request. Refresh it and try again.` Conflict responses contain no version values, EF/SQL details, or stack traces. The UI distinguishes this from an invalid status transition, retains a failed edit's form values, and does not retry automatically. Clients should refresh and review the latest representation before retrying with its version; they must not blindly fetch a newer token and replay stale values.

### Activity history

Create, title, description, priority, category, status, and assignment changes produce activity events in the same `SaveChanges` as the associated work item change. An `expectedVersion` mismatch stages no mutation or event and does not call `SaveChanges`. EF Core's transaction rolls back both the mutation and staged activity when a race fails the database version check; a stale request cannot leave a ghost event. No-op descriptive updates do not add events. Events currently have a nullable `actorUserId`; until Phase 4 authentication exists, the UI labels an absent actor as `System`.

## Scope deferred to later phases

Authentication, user IDs for assignment, comments, dashboard summaries, and authorization are not part of the current API. The assignment field is a display name for the pre-authentication vertical slice. Future routes should preserve `/api/v1`, Problem Details, and server-side validation conventions.
