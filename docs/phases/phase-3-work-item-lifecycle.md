# Phase 3 — Core Work Item Lifecycle

## Delivered

Phase 3 adds one end-to-end work item lifecycle from PostgreSQL through the API and React client:

- Create a work item with title, description, priority, optional active category, and optional assignee display name.
- Browse responsive desktop table and mobile card views; search title, description, or assignee; filter by status, priority, category, and assignee; sort; and page server-side.
- Open item details, edit descriptive fields, assign or unassign a display name, and move through server-defined status transitions.
- Review newest-first activity for creation, meaningful field edits, status changes, category changes, and assignment changes.
- Handle loading, retryable API errors, form validation, filtered and global empty results, and invalid status conflicts.

## API and data changes

The versioned API contract and request examples are in [API Design](../API_DESIGN.md). The Phase 3 migration adds `Categories` and `ActivityEvents`, a nullable category reference, and query indexes. It seeds four stable categories and preserves legacy work items. See [Data Model](../DATA_MODEL.md) for constraints and relationships.

An item's update and its activity event are saved together. No-op updates do not add events. Status rules are enforced in the domain and return `409 Conflict` for an invalid transition. Assignment stores a display name until Phase 4 establishes user identity. `ActorUserId` remains nullable and the UI displays `System` when it is absent.

## Automated verification

- Domain and application unit tests cover entity invariants, allowed/denied transitions, service behavior, and event creation.
- PostgreSQL API integration tests exercise create/read/update, categories, assignment, activity ordering, validation, not found, status conflicts, query filters/sort/pagination, and migration compatibility with a pre-existing Phase 1 work item.
- React Testing Library and Vitest tests cover create-form validation and submission, server field errors, list loading/error/empty/populated states, search debounce and URL state, pagination, detail activity rendering, edits, status conflicts, and assignment refresh.
- Frontend CI runs formatting, lint, tests, and the production build. Backend CI runs format, build, unit tests, and PostgreSQL integration tests.

Run frontend verification from `frontend/`:

```bash
npm ci
npm run format:check
npm run lint
npm run test -- --run
npm run build
```

Run backend verification from the repository root using the commands in [backend/README.md](../../backend/README.md). PostgreSQL integration tests require `FLOWOPS_TEST_CONNECTION` to point to a disposable database.

## API tooling

Import `docs/postman/FlowOps.postman_collection.json` into Postman. The companion `FlowOps.local.postman_environment.json` supplies the local API base URL. The collection includes lifecycle requests and captures a created work item ID for follow-up requests.

## Manual browser acceptance

The local React app was exercised against the migrated PostgreSQL database at desktop size and at a 390 × 844 mobile viewport:

- Created a work item, edited its title, description, priority, and category, assigned and reassigned a display name, and verified the corresponding activity entries.
- Exercised every allowed status edge through the UI: To Do → In Progress/Blocked, In Progress → Blocked/Done, and Blocked → In Progress/To Do. Confirmed Done exposes no next status. An attempted Done → To Do API request returned `409 application/problem+json`.
- Applied search, status, priority, category, assignee, sort direction, and page-size controls; checked the URL state, next-page navigation, and state after reload.
- Checked responsive mobile cards and stacked filters, keyboard access to the create dialog and pagination, and found no browser console warnings or errors.

## Scope boundary

Authentication, authorization, real user references, comments, and dashboard aggregation remain future work. This phase intentionally provides an unauthenticated development/demo workflow, not production identity or access controls.
