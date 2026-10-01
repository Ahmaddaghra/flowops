# Resolved FlowOps development defects

These **six historical defects** are supported by actual repository history, current regression tests, and the Stage 4C/4D checkpoint evidence. They were found during local development/review; no production incident or customer impact is claimed. The pre-fix recipes below explain the affected behavior and require isolated data or a controlled test harness. They were **not rerun against historical revisions in Stage 4F**. Current regression suites and prior browser evidence verify the fixes; a historical parent revision must never replace the current working checkout or use the developer database.

Severity uses the brief's scale: **High** for lost persisted updates or an authorization boundary bypass; **Medium** for wrong-resource presentation or broken keyboard focus that impedes use; **Low** for minor presentation problems; **Critical** is reserved for an exceptional broad compromise and is not assigned here. Severity reflects this local application's demonstrated behavior rather than hypothetical production consequences.

Inspect evidence with `git show <fix-commit>` and `git show <affected-revision>:<path>`. Backend regressions are in [WorkItemsApiTests](../../backend/tests/FlowOps.IntegrationTests/WorkItemsApiTests.cs) and [AuthorizationApiTests](../../backend/tests/FlowOps.IntegrationTests/AuthorizationApiTests.cs). Frontend race/focus regressions are in [WorkItemDetailPage.test.tsx](../../frontend/src/features/work-items/pages/WorkItemDetailPage.test.tsx). The approved historical checkpoint narrative is retained in [the Phase 4 document](../phases/phase-4-auth-collaboration-qa.md).

## BUG-001 — Concurrent loaded lifecycle snapshots could both save

**Severity:** High — a stale server snapshot could replace a persisted lifecycle winner and record an event for a transition evaluated against old state.

**Environment / affected layer:** Phase 3 .NET/EF Core/PostgreSQL. Affected revision `28f0b91`, before domain versioning and the concurrency migration; this predates Phase 4 authentication.

**Preconditions:** Disposable Phase 3 database; one item in InProgress; two independent scoped DbContexts/services, both loading that item before either writes. Use controlled interleaving as in the current PostgreSQL regression rather than relying on random request timing.

**Steps to reproduce:**

1. Load the same InProgress item into scopes A and B at the affected revision.
2. In A, transition to Blocked and save its activity.
3. In B, transition its still-InProgress snapshot to Done and save.
4. Read persisted status and both transition events from a fresh context.

**Actual result before fix:** No concurrency token guarded the UPDATE; B could save its stale transition after A, replacing the winner. Both staged events could persist, even though the second transition was checked against the earlier InProgress state.

**Expected result:** The first permitted save wins; the stale save conflicts and persists neither its mutation nor activity. The final item and history describe the winning transition only.

**Root cause:** Domain mutations had no persisted version, and EF updates lacked an original-version predicate. Domain lifecycle validation alone could not detect another scope's intervening write.

**Fix:** `7709588` introduces version increments; `b7f318d` configures the EF concurrency token/additive migration and maps `DbUpdateConcurrencyException` to the safe application conflict. WorkItem and activity share one save transaction. Regression coverage was introduced in `3f0aaad`.

**Regression test:** `WorkItemsApiTests.StaleConcurrentStatusChange_ConflictsAndRollsBackActivity`; `StaleDescriptiveEdit_ConflictsWithAssignmentMutation`; `StaleConcurrencyConflictOnStatusRoute_ReturnsSafeProblemDetails`; `WorkItemTests.MeaningfulMutations_IncrementVersion`.

**Status:** Resolved in the cited commits; current PostgreSQL/domain regressions retained. This is the database race after server load, distinct from BUG-002's stale client representation.

## BUG-002 — A stale browser edit could overwrite a newer server representation

**Severity:** High — an older visible form could silently replace newer persisted fields despite the existing EF concurrency token.

**Environment / affected layer:** Phase 3 API request contract and React edit flow. Affected revision `bb6d0e6`, before the positive client expectedVersion contract. This is a historical pre-authentication revision.

**Preconditions:** Disposable database; one item; two browser contexts. The first context has an edit modal open before the second context saves a changed title.

**Steps to reproduce:**

1. Open item details and its edit form in context A; keep its original field values.
2. In context B, change the title and save successfully.
3. Submit A's old form after B's request has completed, changing a different field or retaining the earlier title.
4. Read detail and activity again.

**Actual result before fix:** A's PATCH carried no client snapshot version. The server loaded B's latest row, so EF compared against that new server-load version and accepted A's stale field values. B's updated title could be overwritten without a stale-client conflict.

**Expected result:** A submits the version it saw when the modal opened; a mismatch returns `409`, retains the draft and visible conflict, and leaves B's winning fields/version/activity intact.

**Root cause:** The EF token protected races between server load and save, but did not connect a browser's earlier representation to the later request. Request DTOs and frontend mutation calls lacked expectedVersion.

**Fix:** `42e32f7` exposes response Version and validates positive expectedVersion before mutation/activity/save. `f0909d5` propagates server versions through frontend lifecycle requests and freezes the edit-modal snapshot. `e934f6d` and `bb28cde` add stale-client/version regressions; `254ec2c` strengthens persisted-state comparison.

**Regression test:** `WorkItemServiceTests.StaleExpectedVersion_ConflictsBeforeMutationActivityOrSave`; `WorkItemsApiTests.StaleClientRepresentation_ReturnsConflictAndPreservesWinnerAndActivity`; detail test `keeps a stale edit form and shows the conflict without retrying` and `uses the status response version for the next edit`.

**Status:** Resolved. Current manual recipes: CON-001/CON-002. The deterministic Stage 4F stale snapshot/winner/loser collection flow checks the HTTP boundary separately from the database-scope race.

## BUG-003 — A late detail response could display item A under item B's route

**Severity:** Medium — wrong-resource content and drafts could confuse the user and subsequent actions. This local application permits authenticated reads of all items; no cross-tenant disclosure is claimed.

**Environment / affected layer:** React detail routing and asynchronous GET state. Affected revision `d4545e5`, the parent of the detail-scoping fix.

**Preconditions:** Two items with distinguishable titles/descriptions; controlled router/API harness with persistent links outside detail, as in the current deferred-response test. Route changes must occur inside the same SPA instance; a full document reload is not the reproduction.

**Steps to reproduce:**

1. Open route A and hold its detail GET unresolved.
2. Navigate within the harness to route B and let B's detail GET finish.
3. Resolve A's older response with A's title/description.
4. Inspect the current route, heading, details, and loading/error state.

**Actual result before fix:** The old callback called unscoped `setItem`/draft setters and its finally cleared the shared loading flag. A could replace B's visible details after navigation.

**Expected result:** Only B's result is rendered on B. Old success/error/finally callbacks cannot replace its representation, draft, loading, or error state.

**Root cause:** Detail results and callback state changes had neither item-ID ownership nor request-sequence checks.

**Fix:** `e7d18a0` associates results/errors with resource/request IDs, invalidates counters on route change, and guards detail state changes. Later lifecycle guards preserve the same scoping discipline.

**Regression test:** Detail test `ignores a late detail response after navigating to another work item`; retained route-specific mutation/error tests.

**Status:** Resolved; deterministic deferred-response regression retained. No new historical browser rerun is claimed.

## BUG-004 — Late activity could show another item's history

**Severity:** Medium — a timeline could describe the wrong item's lifecycle and actors, undermining audit interpretation without changing persistence.

**Environment / affected layer:** React activity loading. Affected revision `867a0c8`, the parent of the activity-scoping fix.

**Preconditions:** A and B have distinguishable activity descriptions; a controlled SPA router/API harness can defer A's activity GET while detail itself resolves.

**Steps to reproduce:**

1. Open A, resolve its detail, and hold its activity GET.
2. Navigate inside the SPA to B and resolve B's detail/activity.
3. Release A's old activity response, or its failure.
4. Inspect B's timeline and activity loading/error state.

**Actual result before fix:** Unscoped activity success/error/finally callbacks replaced the shared timeline or its error/loading state. B could display A's history after B had already loaded.

**Expected result:** Activity belongs to the current route and newest request; A's late result is ignored and cannot refresh or clear B's activity state.

**Root cause:** Activity state was a single array/error rather than a resource-scoped result. Request completion had no current-ID/sequence guard.

**Fix:** `d4545e5` introduces activity item/request refs, route invalidation, resource-scoped results, and guarded callbacks. Stage 4E uses the guarded refresh when a current-route comment succeeds.

**Regression test:** Detail test `ignores a late activity response after navigating to another work item`; Stage 4E test `does not apply an old route comment POST or refresh the next route activity (error: %s)` prevents a related comment-completion regression.

**Status:** Resolved; current deferred timeline and comment-route tests retained.

## BUG-005 — Edit modal failed to restore focus to its trigger

**Severity:** Medium — keyboard users lost their location after dismissal/save, and asynchronous rerenders could disturb focus while editing.

**Environment / affected layer:** React Modal/detail focus handling. Affected revision `277c10d`, immediately before `22d72e0`; discovered in actual Stage 4D rendered-browser QA.

**Preconditions:** Authenticated caller with canEdit; existing detail page; keyboard input. For the asynchronous branch, delay Activity completion until the edit modal is open.

**Steps to reproduce:**

1. Focus Edit details and press Enter.
2. Move focus within the modal, then press Escape.
3. Check whether focus returns to Edit details.
4. Repeat with an Activity completion while open; separately save an edit with delayed Activity refresh and check final focus.

**Actual result before fix:** The autofocus title could already be active when Modal captured previousFocus. After unmount that node was disconnected, so the trigger was not restored. Changing onClose function identity could also restart the focus effect during rerenders; a save could close while the trigger was still disabled.

**Expected result:** Modal focus remains trapped/stable while open. Escape and completed save return focus to the enabled Edit details trigger, regardless of Activity completion.

**Root cause:** Focus restoration relied solely on `document.activeElement`, an unstable callback was passed to the effect, and close/unlock timing did not ensure a usable target.

**Fix:** `22d72e0` adds an explicit triggerRef, stable close callback, and successful close/unlock after Activity refresh. `4db1267` adds the focused regressions. Stage 4D's checkpoint and real mobile Escape/desktop save checks record the discovery and verification.

**Regression test:** Detail test `traps keyboard focus and restores Edit details after Escape (activity completes while open: %s)` (both parameter values); `restores edit trigger focus after saving and completing a delayed activity refresh`.

**Status:** Resolved and browser-verified in Stage 4D; current tests retained. Manual recipe: UX-002. Three regression cases correspond to the two parameter values plus successful-save case.

## BUG-006 — Member self-assignment bypassed the unowned legacy boundary

**Severity:** High — an unrelated Member could establish assignment and thereby obtain lifecycle rights on a record intended to require Admin intervention.

**Environment / affected layer:** Stage 4B/4C application assignment authorization and capability mapping. Affected revision `6ef9b89`, before Stage 4C's final authorization correction `565800e`.

**Preconditions:** Disposable migrated database; valid Member; legacy item with both creator and real assignee IDs null. A historical display name may match the Member, but it must confer no rights.

**Steps to reproduce:**

1. GET the legacy item as Member and retain its current version.
2. POST `/assign` with that Member's ID and the current expectedVersion.
3. Inspect assignment/version/activity and the returned edit/status capabilities.
4. After assignment, attempt an ordinary permitted-assignee edit to demonstrate the resulting rights.

**Actual result before fix:** General self-assignment treated every unassigned item as eligible, including null/null legacy items. The Member could claim assignment and gain ordinary assignee edit/status permissions without Admin establishing a trusted user relationship.

**Expected result:** Unowned legacy edit/status/assignment requires Admin. Member self-assignment is `403` before version checks or writes, including a stale supplied version. Admin may legitimately assign an active user; self-unassignment later restores the legacy boundary. Comments remain independently allowed under Stage 4E's authenticated read policy.

**Root cause:** The legacy guard existed for edit/status but was missing from RequireAssignment, and canSelfAssign only checked whether the item was unassigned. The Stage 4C initial preflight audit had checked the boundary too narrowly.

**Fix:** `565800e` adds the explicit null/null non-Admin denial and aligns capabilities with creator-backed self-assignment. The Stage 4C checkpoint transparently records the final audit correction; it did not add Stage 4D UI or alter migration history.

**Regression test:** `WorkItemAuthorizationTests.Legacy_MemberSelfAssignmentIsForbiddenBeforeVersionValidationAndWrites`; `AuthorizationApiTests.Legacy_MemberSelfAssignmentReturnsForbiddenBeforeConcurrencyAndChangesNothing`; `LegacyName_GrantsNoOwnership_AdminAssignmentEnablesMemberMutation`; assignment test `does not grant assignment from a matching historical display name`.

**Status:** Resolved; unit/PostgreSQL current/stale denial and real Stage 4D legacy assignment/relock checks retained. Manual recipe: AUTHZ-007.
