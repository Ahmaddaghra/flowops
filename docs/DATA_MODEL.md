# Initial Data Model

This model is intentionally small enough to finish well and rich enough to demonstrate relational design, API behavior, and business rules.

## User
- Id
- Name
- Email
- Password/Identity reference
- Role
- CreatedAt

## WorkItem
- Id
- Title
- Description
- Status
- Priority
- CategoryId
- CreatedByUserId
- AssignedToUserId (nullable)
- CreatedAt
- UpdatedAt

## Category
- Id
- Name
- IsActive

## Comment
- Id
- WorkItemId
- AuthorUserId
- Body
- CreatedAt

## ActivityEvent
- Id
- WorkItemId
- ActorUserId
- EventType
- Description / structured metadata
- CreatedAt

## Candidate status flow

```text
New -> In Progress -> Resolved -> Closed
 |         |             |
 +-------> Blocked <-----+
```

Exact transitions should be encoded and tested server-side rather than trusted from UI state.
