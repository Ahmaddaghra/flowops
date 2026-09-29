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

Change status:

```json
{ "status": "InProgress" }
```

Unassign by sending a null or empty `assigneeName`:

```json
{ "assigneeName": null }
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

WorkItem mutations use an optimistic concurrency token enforced by EF Core on the server. If a request loaded an older version and another mutation saved first, the stale write returns `409` with title `Work Item Concurrency Conflict` and detail `This work item was modified by another request. Refresh it and try again.` The response does not expose EF or SQL details. The UI differentiates this stale-write conflict from an invalid status transition.

### Activity history

Create, title, description, priority, category, status, and assignment changes produce activity events in the same `SaveChanges` as the associated work item change. EF Core's transaction rolls back both the mutation and staged activity when the version check fails; a stale request cannot leave a ghost event. No-op descriptive updates do not add events. Events currently have a nullable `actorUserId`; until Phase 4 authentication exists, the UI labels an absent actor as `System`.

## Scope deferred to later phases

Authentication, user IDs for assignment, comments, dashboard summaries, and authorization are not part of the current API. The assignment field is a display name for the pre-authentication vertical slice. Future routes should preserve `/api/v1`, Problem Details, and server-side validation conventions.
