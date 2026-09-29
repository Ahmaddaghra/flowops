# Data Model

This page records the schema implemented through Phase 3. `20260929140705_AddWorkItemLifecycle` adds categories, activity history, and lifecycle query indexes. `20260929163759_AddWorkItemConcurrency` adds the concurrency token while keeping existing work items valid.

## WorkItem

- `Id` — GUID primary key
- `Version` — non-null `long`, starts at `1`; increments on each meaningful mutation and is an EF Core concurrency token
- `Title` — required, trimmed, maximum 200 characters
- `Description` — nullable, maximum 4,000 characters
- `Status` — `Todo`, `InProgress`, `Blocked`, or `Done`; defaults to `Todo`
- `Priority` — `Low`, `Medium`, `High`, or `Critical`; defaults to `Medium`
- `CategoryId` — nullable foreign key to `Category`, delete restricted
- `AssigneeName` — nullable display name, maximum 100 characters
- `CreatedAtUtc`, `UpdatedAtUtc` — UTC timestamps

Status transitions are enforced in the domain entity. The exact matrix has no self-transitions, and `Done` is terminal. Category and assignee are optional so older Phase 1 records remain compatible. EF Core uses the originally loaded `Version` in each update predicate; a stale concurrent mutation affects zero rows and becomes an application-level conflict rather than a last-write-wins update.

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

An index on `(WorkItemId, CreatedAtUtc)` supports the newest-first activity endpoint. Lifecycle writes save the changed item and its events together in one database transaction. A client version mismatch changes nothing, stages no event, and skips saving. If the EF version check fails during saving, the transaction rolls back both the WorkItem mutation and staged activity. Phase 4 can connect actor IDs to an authenticated user table.

## Relationships and persistence notes

```text
Category 1 ─── 0..* WorkItem
WorkItem 1 ─── 0..* ActivityEvent
```

- A work item can have zero or one category; deleting a referenced category is restricted.
- A work item may be unassigned; assignment currently stores a display name instead of a user foreign key.
- The lifecycle migration adds a nullable category reference and new tables/indexes. Integration coverage migrates a database containing a legacy work item and verifies it remains readable.
- `AddWorkItemConcurrency` adds `WorkItems.Version` as a non-null column with default `1`, so existing rows remain valid and new domain entities start at version `1`.
- Work item responses expose `version`; clients must send the representation's positive `expectedVersion` for descriptive/category/priority edits, status changes, and assignment/unassignment. The application checks it against the requested item before mutation or activity staging, then EF Core protects races after loading. Both stale representations and database races return HTTP 409. Clients refresh and review the latest state before retrying, so an old page submitted after another write completes cannot silently overwrite that write.
- The `AddWorkItemConcurrency` migration's `Down` path drops only `WorkItems.Version`. The earlier `AddWorkItemLifecycle` migration's `Down` path removes the category reference and activity data; use that rollback only when Phase 3 history can be discarded.

## Deferred entities

User identity and comments remain planned for Phase 4. Their fields should be introduced with the authentication and authorization design rather than represented as unenforced references in this schema.
