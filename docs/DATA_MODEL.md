# Data Model

This page records the schema through the Phase 4 Stage 4A/4B backend checkpoint. Existing Phase 3 migrations remain unchanged: `20260929140705_AddWorkItemLifecycle` adds categories, activity history, and lifecycle query indexes; `20260929163759_AddWorkItemConcurrency` adds the concurrency token. The additive `20260929223011_AddIdentityFoundation` and `20260929223344_AddUserBackedWorkItems` migrations introduce identity and real user references without removing existing work items or activity.

## Identity users and roles

Infrastructure defines `ApplicationUser : IdentityUser<Guid>` with `DisplayName` and `IsActive` (default true). `FlowOpsDbContext` derives from the GUID-based Identity context and stores Identity tables in the same PostgreSQL database as the application tables. Identity supplies proven password hashing and user/role management. Domain has no dependency on Identity and no Identity navigation properties.

The application uses exactly `Admin` and `Member` roles, defined as constants and seeded deterministically. Registration always adds Member. The Development-only optional admin bootstrap reads private configuration; its credentials are not migration seed data. Tests create their own users independently of developer bootstrap values.

User IDs and display names may appear in safe DTOs; email and role information appear in authentication/current-user DTOs. Password hashes, security stamps, and other Identity security fields are never public response contracts. Assignment eligibility uses `IsActive`; temporary login lockout does not change it. No user-management endpoint is part of this checkpoint.

## WorkItem

- `Id` — GUID primary key
- `Version` — non-null `long`, starts at `1`; increments on each meaningful mutation and is an EF Core concurrency token
- `Title` — required, trimmed, maximum 200 characters
- `Description` — nullable, maximum 4,000 characters
- `Status` — `Todo`, `InProgress`, `Blocked`, or `Done`; defaults to `Todo`
- `Priority` — `Low`, `Medium`, `High`, or `Critical`; defaults to `Medium`
- `CategoryId` — nullable foreign key to `Category`, delete restricted
- `CreatedByUserId` — nullable GUID foreign key to `ApplicationUser`, delete restricted; set from authenticated context on new items
- `AssigneeUserId` — nullable GUID foreign key to `ApplicationUser`, delete restricted; current real user assignment
- `AssigneeName` — retained nullable Phase 3 legacy snapshot, maximum 100 characters; never used for authorization
- `CreatedAtUtc`, `UpdatedAtUtc` — UTC timestamps

Status transitions are enforced in the domain entity. The exact matrix has no self-transitions, and `Done` is terminal. Nullable ownership/assignment IDs preserve older records, while new items always receive the authenticated creator's ID. Infrastructure configures user foreign keys without introducing Identity types into Domain. EF Core uses the originally loaded `Version` in each update predicate; a stale concurrent mutation affects zero rows and becomes an application-level conflict rather than a last-write-wins update.

Existing `AssigneeName` values are preserved exactly as historical data. No migration tries to infer user relationships by matching names. A real Phase 4 assignment updates `AssigneeUserId` and leaves the historical snapshot intact. Responses expose that snapshot as `legacyAssigneeName`; the compatibility `assigneeName` field resolves a current assignee display name first and otherwise falls back to the snapshot. After a real assignee is removed the snapshot may still be displayed as historical text. Only user IDs and roles determine permissions.

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
- `ActorUserId` — nullable GUID foreign key to `ApplicationUser`, delete restricted; populated from authenticated context for new lifecycle events
- `EventType` — `Created`, `TitleChanged`, `DescriptionChanged`, `PriorityChanged`, `CategoryChanged`, `StatusChanged`, or `AssignmentChanged`
- `Description` — required human-readable event text, maximum 1,000 characters
- `CreatedAtUtc` — UTC timestamp

An index on `(WorkItemId, CreatedAtUtc)` supports the newest-first activity endpoint. Lifecycle writes save the changed item and its events together in one database transaction. Permission checks happen before expected-version checks and before mutation or event staging. A forbidden request or client version mismatch changes nothing, stages no event, and skips saving. If the EF version check fails during saving, the transaction rolls back both the WorkItem mutation and staged activity. Response mapping resolves safe `actor` summaries and `actorDisplayName`; legacy events with null actors retain the `System` fallback. Historical actor data is not rewritten.

## Relationships and persistence notes

```text
Category 1 ─── 0..* WorkItem
ApplicationUser 1 ─── 0..* WorkItem (creator)
ApplicationUser 1 ─── 0..* WorkItem (assignee)
WorkItem 1 ─── 0..* ActivityEvent
ApplicationUser 1 ─── 0..* ActivityEvent (actor)
```

- A work item can have zero or one category; deleting a referenced category is restricted.
- A work item may have no creator for legacy compatibility, or no current user assignee. User-backed assignments use GUID references with indexes; a display-name snapshot cannot grant permissions.
- The lifecycle migration adds a nullable category reference and new tables/indexes. Integration coverage migrates a database containing a legacy work item and verifies it remains readable.
- `AddWorkItemConcurrency` adds `WorkItems.Version` as a non-null column with default `1`, so existing rows remain valid and new domain entities start at version `1`.
- Work item responses expose `version`; clients must send the representation's positive `expectedVersion` for descriptive/category/priority edits, status changes, and user assignment/unassignment. After authorization the application checks it against the requested item before mutation or activity staging, then EF Core protects races after loading. Both stale representations and database races return HTTP 409. Clients refresh and review the latest state before retrying, so an old page submitted after another write completes cannot silently overwrite that write.
- The `AddWorkItemConcurrency` migration's `Down` path drops only `WorkItems.Version`. The earlier `AddWorkItemLifecycle` migration's `Down` path removes the category reference and activity data; use that rollback only when Phase 3 history can be discarded.
- `AddIdentityFoundation` adds the GUID Identity schema and deterministic roles. `AddUserBackedWorkItems` adds nullable ownership/assignment IDs and user foreign keys/indexes for creator, assignee, and existing activity actor IDs. All three user relationships restrict deletion of referenced accounts. Neither migration rewrites Phase 3 data or migration history. Verification evidence is recorded in the [Phase 4 checkpoint](phases/phase-4-auth-collaboration-qa.md).
- A rollback from the ownership migration removes the new relationship columns, so it loses Phase 4 ownership/assignment references; original work item fields, legacy assignment snapshots, and activity history remain. Rolling back the Identity migration removes accounts and roles. Use a disposable database for migration down/up verification, and preserve a backup before rolling back a database containing real Phase 4 users.

## Deferred entities

Comments remain pending Stage 4E. The intended model has a work item ID, authenticated author ID, required trimmed body, and UTC creation timestamp, with comment/activity writes saved atomically and no work item version increment for a comment alone. No comment table or comment endpoint is part of Stage 4A/4B. Dashboard data belongs to Phase 5.
