# Data Model

This page records the schema implemented through Phase 3. `20260929140705_AddWorkItemLifecycle` adds categories, activity history, and lifecycle query indexes to the Phase 1 database while keeping existing work items valid.

## WorkItem

- `Id` — GUID primary key
- `Title` — required, trimmed, maximum 200 characters
- `Description` — nullable, maximum 4,000 characters
- `Status` — `Todo`, `InProgress`, `Blocked`, or `Done`; defaults to `Todo`
- `Priority` — `Low`, `Medium`, `High`, or `Critical`; defaults to `Medium`
- `CategoryId` — nullable foreign key to `Category`, delete restricted
- `AssigneeName` — nullable display name, maximum 100 characters
- `CreatedAtUtc`, `UpdatedAtUtc` — UTC timestamps

Status transitions are enforced in the domain entity. `Done` is terminal. Category and assignee are optional so older Phase 1 records remain compatible.

## Category

- `Id` — seeded GUID primary key
- `Name` — required, trimmed, maximum 100 characters
- `NameKey` — uppercase invariant key with a unique index
- `IsActive` — inactive categories are omitted from the list and cannot be newly assigned
- `CreatedAtUtc` — UTC timestamp

The migration seeds Operations, Support, Engineering, and Billing using stable IDs. Work items may have no category.

## ActivityEvent

- `Id` — GUID primary key
- `WorkItemId` — required foreign key; events cascade-delete with the work item
- `ActorUserId` — nullable GUID reserved for authenticated actors
- `EventType` — `Created`, `TitleChanged`, `DescriptionChanged`, `PriorityChanged`, `CategoryChanged`, `StatusChanged`, or `AssignmentChanged`
- `Description` — required human-readable event text, maximum 1,000 characters
- `CreatedAtUtc` — UTC timestamp

An index on `(WorkItemId, CreatedAtUtc)` supports the newest-first activity endpoint. Lifecycle writes save the changed item and its events together. Phase 4 can connect actor IDs to an authenticated user table.

## Relationships and persistence notes

```text
Category 1 ─── 0..* WorkItem
WorkItem 1 ─── 0..* ActivityEvent
```

- A work item can have zero or one category; deleting a referenced category is restricted.
- A work item may be unassigned; assignment currently stores a display name instead of a user foreign key.
- The lifecycle migration adds a nullable category reference and new tables/indexes. Integration coverage migrates a database containing a legacy work item and verifies it remains readable.
- The migration's `Down` path removes the Phase 3 category reference and activity data. It is intended for controlled rollback, not as a data-preserving operation for Phase 3 history.

## Deferred entities

User identity and comments remain planned for Phase 4. Their fields should be introduced with the authentication and authorization design rather than represented as unenforced references in this schema.
