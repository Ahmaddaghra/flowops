# Phase 4 manual test cases

This suite contains **28 designed cases** for the approved Stage 4A–4E implementation. These case IDs were introduced in Stage 4F; **none is recorded as a newly executed manual run**. Prior browser checks and automated regressions are supporting evidence, not an execution of every step below. Record a date, revision, environment, observed result, and sanitized evidence before changing a case to Passed or Failed. The Stage 4F API collection run is recorded separately in [postman-guide.md](postman-guide.md).

Use a disposable PostgreSQL database migrated to the latest schema, the API at `http://localhost:5055`, and the frontend at `http://localhost:5173`. Follow [backend setup](../../backend/README.md), [frontend setup](../../frontend/README.md), and the [Postman guide](postman-guide.md). Create isolated Member A, Member B, and a Development-only Admin; keep credentials and tokens in private runtime configuration. Do not test against developer data. A browser context means a separate browser profile/incognito context with its own sessionStorage.

Use a fresh item per case unless a precondition states otherwise. An ordinary item is created by A, has a creator user ID, and is initially unassigned. Record IDs, versions, status, and activity counts from safe response bodies; never retain passwords, raw tokens, Authorization values, or screenshots containing credentials. Authenticated API steps use the collection's local bearer variables. `expectedVersion` always comes from the appropriate safe WorkItem response; comments accept only `{ "body": "..." }`.

Evidence keys refer to the historical verification recorded in [the Phase 4 checkpoint](../phases/phase-4-auth-collaboration-qa.md): **4C** means 17 real-Member Chromium checks; **4D** means 23 real Admin/Member checks; **4E** means 20 real-Member comments checks. Original sanitized JSON reports and inspected screenshots accompanied those checkpoints. Their earlier scope and dates must be retained when citing them.

## Authentication

### AUTH-001 — Register a Member

**Requirement:** Public registration creates Member only and trusts no client role.

**Preconditions:** A unique disposable email; no active browser session.

**Steps:**

1. Open `/register`; enter a display name, unique email, policy-compliant password, and matching confirmation.
2. Submit and inspect the safe returned user and resulting page.
3. Run `Authentication / Reject role selection at registration` with a separate unique email.

**Expected:** Registration returns `201`, role includes Member, and the authenticated user's name appears on Work Items. Only token/expiry metadata is persisted in sessionStorage. A submitted role is rejected with `400`; no Admin account is created.

**Automation reference:** `AuthApiTests.Register_CreatesMember_WithSafeResponseAndExpectedJwtClaims`; `Register_RejectsRoleSpoof_WithoutCreatingAnAdmin`; `AuthPages.test.tsx` — `registers with only trusted request fields and moves to work items`.

**Status:** Designed — not executed under this ID. Prior evidence: 4C real registration/intended-route verification.

### AUTH-002 — Valid login

**Requirement:** Valid credentials establish the authoritative user and intended route.

**Preconditions:** Registered A; signed out; an existing readable item.

**Steps:**

1. Navigate anonymously to `/work-items/{id}?source=qa#comments`.
2. On login, enter A's valid credentials and submit.
3. Check the destination and authenticated header; inspect storage key names only.

**Expected:** Login returns `200`, safe user identity matches A, and the requested internal path/query/hash is restored. No user/role object is persisted beside token/expiry metadata.

**Automation reference:** `AuthApiTests.LoginAndMe_ReturnSafeIdentityAndRole`; `AuthPages.test.tsx` — `submits credentials and returns to the intended protected location with query and hash`.

**Status:** Designed — not executed under this ID. Prior evidence: 4C real login and intended-route checks.

### AUTH-003 — Wrong password

**Requirement:** Invalid credentials produce a generic error without granting a session.

**Preconditions:** Registered A; signed out.

**Steps:**

1. Open `/login` and submit A's email with one deliberately incorrect password.
2. Compare the response/message with one unknown disposable email attempt.
3. Correct the credentials and retry once; avoid repeated failures that intentionally trigger lockout.

**Expected:** Both invalid attempts return `401` with the same generic message. The form remains usable, no new authenticated session is established, and the valid retry succeeds. No account-existence detail is disclosed.

**Automation reference:** `AuthApiTests.Login_WrongPasswordAndUnknownAccount_HaveIdenticalGenericFailures`; `AuthPages.test.tsx` — `shows generic credential failure, keeps the form, and allows retry`.

**Status:** Designed — not executed under this ID. Prior evidence: 4C wrong-credential and successful-login checks.

### AUTH-004 — Anonymous and invalid-session protected access

**Requirement:** Protected routes and APIs reject missing/invalid authentication.

**Preconditions:** Signed-out browser; known item ID; no usable token in the negative request.

**Steps:**

1. Open `/work-items/{id}` in a fresh context.
2. Run `Negative Authorization / Anonymous protected request` and `Malformed bearer token`.
3. For invalid-session UX, use the disposable browser's DevTools sessionStorage editor to set `flowops.auth.token` to `not-a-real-jwt` and `flowops.auth.expiresAt` to a future ISO UTC timestamp. Reload a protected route so `/auth/me` reaches the real API; inspect storage presence as booleans, without recording real session values.

**Expected:** Anonymous navigation opens login with a safe intended destination. API requests return `401`. A protected current-session `401` clears matching token/expiry keys and follows normal route protection; a late old-session failure must not erase a newer login.

**Automation reference:** `AuthorizationApiTests.WorkItemRoutes_AnonymousRequests_ReturnUnauthorized`; `AuthApiTests.MeAndDirectory_RejectInvalidAuthentication`; `client.test.ts` — `clears both persisted keys on a protected 401`; `does not let an old request 401 erase a newer login`.

**Status:** Designed — not executed under this ID. Prior evidence: 4C anonymous/invalid `/me`, 4D assignment `401`, and 4E comment `401` checks.

### AUTH-005 — Logout

**Requirement:** Local logout clears the session and protects subsequent navigation.

**Preconditions:** A is logged in and viewing a detail page.

**Steps:**

1. Activate Logout in the header.
2. Inspect absence of both persisted session keys without recording values.
3. Navigate directly back to the detail URL and use browser Back.

**Expected:** Identity disappears, login renders, and protected content is unavailable. Local logout does not revoke an already-issued JWT server-side; no server logout endpoint exists.

**Automation reference:** `authSession.test.ts`; `AuthProvider.test.tsx` — `ignores a /me response that arrives after logout`; `does not resurrect a login that completes after logout`; protected-route tests in `AuthRoutes.test.tsx`.

**Status:** Designed — not executed under this ID. Prior evidence: 4C and 4E real logout/navigation checks.

### AUTH-006 — Reload and recoverable session bootstrap

**Requirement:** Reload restores identity through `/auth/me` and treats server failure separately from invalid credentials.

**Preconditions:** A is logged in; browser response interception available for an isolated negative check.

**Steps:**

1. Reload a protected page; observe the loading state and `/auth/me` response.
2. Intercept only `/auth/me` once with `503`, then reload.
3. Remove interception and activate Try again.

**Expected:** Protected content waits for authoritative identity. A `503` retains the session and offers retry/sign out; retry reaches the real API. A real `/me` `401` instead clears the matching session and opens login.

**Automation reference:** `AuthProvider.test.tsx` — `blocks initialization until the authoritative /me user arrives`; `clears an invalid bootstrap session on /me 401`; parameterized recoverable-bootstrap cases; `AuthRoutes.test.tsx` — `offers retry and explicit signout after a bootstrap connection failure`.

**Status:** Designed — not executed under this ID. Prior evidence: 4C reload, intercepted-bootstrap-failure, and real-backend retry checks.

## Authorization and assignment

### AUTHZ-001 — Creator can edit and change status

**Requirement:** A Member creator has lifecycle rights independently of assignment.

**Preconditions:** A created an unassigned Todo item; A is logged in.

**Steps:**

1. Open detail and use Edit details to change only the title.
2. Save; retain the returned version.
3. Activate Move to In Progress and inspect the response/activity.

**Expected:** Both operations return `200`, use the appropriate positive expectedVersion, and show A as actor. Creator and assignee identities are not supplied in the edit body.

**Automation reference:** `WorkItemAuthorizationTests.Permissions_EditAndStatusFollowIdentity`; `AuthorizationApiTests.AuthorizedCreatorAssigneeAndAdmin_CanMutate_AndActivityUsesCaller`; detail test `edits descriptive fields without changing status`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D creator edit/status checks.

### AUTHZ-002 — Unrelated Member cannot edit or change status

**Requirement:** Server authorization rejects unrelated lifecycle mutations even when invoked directly.

**Preconditions:** A created the item; it is unassigned or assigned to A; B is neither creator nor assignee.

**Steps:**

1. Open detail as B and confirm edit/status mutation controls are absent.
2. Run `Negative Authorization / Unrelated Member edit forbidden` and `Unrelated Member status forbidden` against the item.
3. Compare safe detail/activity before and after; check B remains authenticated.

**Expected:** Both direct mutations return `403`, leave fields/version/activity unchanged, and preserve B's session. Forbidden stale versions remain `403` rather than a concurrency result.

**Automation reference:** `WorkItemAuthorizationTests.Forbidden_StopsBeforeVersionMutationActivityOrSave`; `AuthorizationApiTests.UnrelatedMember_IsForbiddenBeforeConcurrencyValidation_AndPersistsNoChanges`; detail test `shows a permission message when a status mutation is forbidden`; `WorkItemForm.test.tsx` forbidden-form retention case.

**Status:** Designed — not executed under this ID. Prior evidence: 4C real status `403` and 4D unrelated-control/forbidden-state checks.

### AUTHZ-003 — Admin override and safe directory

**Requirement:** Admin may mutate an item without creator/assignee relationship and assign only a real active user.

**Preconditions:** A-created InProgress item; Admin is unrelated; A and B are active users.

**Steps:**

1. Login as Admin, edit the title, and move the item to Blocked using each returned version.
2. Open Change assignment; inspect the safe directory response and labelled Assign to select.
3. Assign A, reassign B, then Unassign; use each returned version.

**Expected:** All permitted operations return `200`; directory entries expose only ID/displayName and load lazily. Responses replace the current item/version/capabilities. Activity actors identify Admin; no free-text assignment is accepted.

**Automation reference:** `AuthorizationApiTests.AuthorizedCreatorAssigneeAndAdmin_CanMutate_AndActivityUsesCaller`; `Admin_CanAssignReassignAndUnassign_AnyActiveUser`; `AuthApiTests.Directory_ExposesOnlyActiveUsersAndSafeAssignmentFields`; assignment lazy-directory test.

**Status:** Designed — not executed under this ID. Prior evidence: 4D real Admin assignment/reassignment/unassignment and edit checks. Admin status override also has PostgreSQL regression coverage; this whole manual sequence is not claimed as executed.

### AUTHZ-004 — Member self-assignment establishes assignee rights

**Requirement:** A Member may self-assign an ordinary unassigned item without being its creator.

**Preconditions:** A-created, unassigned Todo item; B logged in.

**Steps:**

1. Open detail as B; activate Assign to me.
2. Inspect the request target and returned version/capabilities.
3. Edit its title and move it to InProgress using the returned versions.

**Expected:** Assignment targets B's verified ID, returns `200`, and grants ordinary assignee edit/status rights. No user picker or directory request is made by B. Later mutations use the server version.

**Automation reference:** `AuthorizationApiTests.Member_CanSelfAssignAndSelfUnassign_WithoutOwningItem`; `AuthorizedCreatorAssigneeAndAdmin_CanMutate_AndActivityUsesCaller`; assignment test `self-assigns using only the authenticated user ID without opening a directory`; detail response-version cases.

**Status:** Designed — not executed under this ID. Prior evidence: 4D self-assignment, assignee edit/status, and zero-Member-directory-request checks.

### AUTHZ-005 — Member cannot assign others or replace another assignee

**Requirement:** Member assignment uses exact identity rules enforced on the API.

**Preconditions:** A-created unassigned item; B logged in; a second item already assigned to A.

**Steps:**

1. Run `Negative Authorization / Member assigning another user forbidden` as B, targeting A on the unassigned item.
2. As B, send `/assign` with B's ID against the A-assigned item; then send null against that same item.
3. Compare both items' fields/version/activity before and after.

**Expected:** Each forbidden operation returns `403` and persists nothing. B cannot choose another user, replace A, or remove A. Authentication remains intact; historical-name matches confer no rights.

**Automation reference:** `WorkItemAuthorizationTests.Assignment_ExactRoleRules`; `AuthorizationApiTests.Member_CannotAssignOtherUsersOrChangeAnotherPersonsAssignment`; assignment test `keeps forbidden assignment errors visible without logging out or refreshing`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D real other-user assignment `403`; replacement/removal variants are covered by PostgreSQL tests, not claimed as prior browser executions.

### AUTHZ-006 — Self-unassign

**Requirement:** A Member can remove their own current assignment.

**Preconditions:** A-created item assigned to B; B logged in; B is not creator.

**Steps:**

1. Open detail as B and activate Unassign me.
2. Inspect `{ assigneeUserId: null, expectedVersion: N }` and the returned representation.
3. Confirm edit/status rights disappear and inspect activity.

**Expected:** Unassignment returns `200` with current version/capabilities and null user assignment. B loses assignee-only lifecycle rights. The existing historical snapshot, if present, is labelled as historical rather than treated as an active user.

**Automation reference:** `AuthorizationApiTests.Member_CanSelfAssignAndSelfUnassign_WithoutOwningItem`; assignment test `self-unassigns without offering arbitrary user assignment`; detail test `uses the returned unassignment response without incrementing the local version`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D self-unassignment and rights-update checks.

### AUTHZ-007 — Legacy lifecycle restriction, with comments allowed

**Requirement:** Null-creator/null-assignee items require Admin for lifecycle changes; authenticated read/comment access remains allowed.

**Preconditions:** An isolated legacy fixture with both user references null and a historical name; use the fixture below only in the disposable QA database. B and Admin exist.

**Steps:**

1. As B, open the fixture; attempt direct self-assignment using both its current version and a stale version.
2. Add a body-only comment as B.
3. As Admin, assign B. As B, edit the title and self-unassign using successive returned versions.
4. Confirm the historical label and denied lifecycle controls return after unassignment.

**Expected:** Initial self-assignment returns `403` for both versions with no lifecycle writes/events. B's comment succeeds without advancing version. Admin assignment establishes B's assignee rights; B's self-unassignment restores the legacy lifecycle boundary. Names never establish identity.

**Automation reference:** `WorkItemAuthorizationTests.Legacy_MemberSelfAssignmentIsForbiddenBeforeVersionValidationAndWrites`; `AuthorizationApiTests.Legacy_MemberSelfAssignmentReturnsForbiddenBeforeConcurrencyAndChangesNothing`; `LegacyName_GrantsNoOwnership_AdminAssignmentEnablesMemberMutation`; `CommentsApiTests.AnyAuthenticatedReader_CanCommentWithoutLifecyclePermission_AndAuthorComesFromJwt`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D legacy assignment/relock and 4E legacy comment/version checks.

Disposable fixture; change the ID if it already exists. No production/developer database use:

```sql
INSERT INTO "WorkItems" ("Id", "Version", "Title", "Description", "Status", "Priority",
  "CategoryId", "AssigneeName", "CreatedAtUtc", "UpdatedAtUtc", "CreatedByUserId", "AssigneeUserId")
VALUES ('40000000-0000-0000-0000-000000000007', 1, 'QA legacy item', NULL, 'Todo', 'Medium',
  NULL, 'Historical owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL);
```

## Work item lifecycle

### WI-001 — Create an unassigned work item

**Requirement:** Creation persists valid fields, JWT creator, and authenticated Created activity.

**Preconditions:** A logged in; seeded active categories available.

**Steps:**

1. Open Work Items → Create work item.
2. Enter a unique title and description, select High and an active category, then submit.
3. Inspect the `201` response, open detail, and reload.

**Expected:** Persisted fields match, status is Todo, version is 1, creator is A, and assignee user ID is null. The UI has no author/creator or free-text assignee input. Created activity identifies A.

**Automation reference:** `WorkItemServiceTests.CreateAsync_WithValidRequest_SavesToStoreAndReturnsResponse`; `CreateAsync_AddsCreatedActivityAtomically`; `WorkItemsApiTests.Categories_Create_Read_AndCreatedActivity_Persist`; form test `submits the complete create request and waits for success`.

**Status:** Designed — not executed under this ID. Prior evidence: 4C/4D/4E real create/detail checks.

### WI-002 — Edit details and retain independent workflow fields

**Requirement:** Editing changes allowed details without accepting status, assignment, or creator spoofing.

**Preconditions:** A-created item; A logged in; record status/assignee/current version.

**Steps:**

1. Open Edit details and change title, description, priority, and category.
2. Submit once and inspect the body/current response.
3. Reload detail and inspect activity.

**Expected:** PATCH contains only allowed detail fields plus positive expectedVersion. Status/assignment remain unchanged. The returned server version, which may advance for several meaningful field changes, is used subsequently. Activities describe actual changes with A as actor.

**Automation reference:** `WorkItemServiceTests.UpdateAsync_RecordsOnlyMeaningfulFieldChanges`; `AuthorizationApiTests.EveryDetailChange_RecordsAuthenticatedActor_AndSummariesContainOnlySafeFields`; detail test `edits descriptive fields without changing status`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D creator/assignee edits; full four-field scenario is supported by automated persistence tests.

### WI-003 — Valid status path

**Requirement:** The documented lifecycle and authenticated activity are enforced.

**Preconditions:** A-created Todo item; A logged in.

**Steps:**

1. Move Todo → InProgress, InProgress → Blocked, Blocked → InProgress.
2. Activate Mark Done and cancel once; verify no status request was sent. Activate it again and accept the confirmation.
3. Inspect each returned version and final workflow controls/activity.

**Expected:** Each legal transition returns `200` with current version and actor. Done is terminal and shows no next-status buttons. Cancellation of Done confirmation sends no mutation.

**Automation reference:** `WorkItemTests.ChangeStatus_AllowsDocumentedTransitions`; `WorkItemsApiTests.Patch_Assignment_Status_AndActivity_Persist`; detail test `uses the status response version for the next edit`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D valid creator/assignee status checks; this entire path has not been claimed as a new manual run.

### WI-004 — Invalid transition and invalid status input

**Requirement:** State conflicts differ from malformed status validation.

**Preconditions:** A-created Todo item; latest version retained; A authenticated.

**Steps:**

1. Directly POST `/status` with `status: "Todo"` and its current expectedVersion.
2. Repeat with `status: "Done"` from Todo.
3. Submit `status: "Unknown"` with the current version, then verify fields/activity.

**Expected:** Same-state and Todo → Done attempts return `409` with Invalid Work Item Transition. Unknown status returns `400` Validation Problem Details. Neither adds activity or changes the item; authentication remains.

**Automation reference:** `WorkItemTests.ChangeStatus_RejectsUndocumentedTransitions`; `ChangeStatus_RejectsSameStateTransition`; `ChangeStatus_RejectsUndefinedEnum`; `WorkItemServiceTests.ChangeStatusAsync_RejectsInvalidTransitionAndDoesNotSave`; `WorkItemsApiTests.SameStateStatusRequest_ReturnsConflict`; `InvalidStatus_ReturnsFieldValidationProblem_WithoutMutationOrActivity`.

**Status:** Designed — not executed under this ID. Prior browser evidence does not prove this full direct-API sequence; automated tests and the Stage 4F collection are separate evidence.

### WI-005 — Search, filters, sorting, and pagination

**Requirement:** Queries are server-side, URL-backed, and distinguish current versus historical assignment names.

**Preconditions:** At least three disposable items with differing titles/status/priority; one current user assignment and one legacy fixture.

**Steps:**

1. Search a unique title substring; inspect debounced URL/request and results.
2. Apply status/priority/category and current-assignee-name filters, then test the legacy name on the unassigned legacy fixture.
3. Clear filters, set page size 1, move Next/Previous, and change sort/direction.
4. Reload the query URL.

**Expected:** Server metadata and rows agree with the criteria. Changing criteria resets the page; reload preserves valid URL controls. Current names match real assignees; historical text matches only when no real user is assigned. A query with no results shows filtered-empty, not global-empty.

**Automation reference:** `WorkItemsApiTests.List_Search_Filters_Sort_AndPagination_AreServerSide`; `WorkItemsPage.test.tsx` — `debounces search, updates the URL, and sends the query to the API`; `requests the next server page and records it in the URL`; current/historical name-filter and empty-state cases.

**Status:** Designed — not executed under this ID. Prior evidence: 4D real current/historical filters; full pagination/query combination requires this manual run.

## Concurrency

### CON-001 — Stale edit preserves the winner

**Requirement:** Browser snapshot N cannot overwrite a later lifecycle mutation.

**Preconditions:** A-created item, version N; A's two contexts are authenticated.

**Steps:**

1. In context 1, open Edit details and type a losing draft without saving.
2. In context 2, change the title and save using N; retain its returned version and activity.
3. Save context 1's original modal using N.
4. Cancel the losing form, manually refresh, and read the item/activity.

**Expected:** Winner succeeds. Loser returns `409` Work Item Concurrency Conflict, retains draft/error/session, and sends no automatic retry. Final fields/version/activity reflect only the winner. No lost-edit activity persists.

**Automation reference:** `WorkItemServiceTests.StaleExpectedVersion_ConflictsBeforeMutationActivityOrSave`; `WorkItemsApiTests.StaleClientRepresentation_ReturnsConflictAndPreservesWinnerAndActivity` (edit); detail test `keeps a stale edit form and shows the conflict without retrying`.

**Status:** Designed — not executed under this ID. Deterministic deferred frontend and PostgreSQL regressions provide current automated evidence; a new two-browser manual execution is not claimed.

### CON-002 — Stale permitted assignment

**Requirement:** Assignment uses its own current representation and rejects stale permitted writes.

**Preconditions:** A-created unassigned item at N; A and Admin contexts open it.

**Steps:**

1. Keep A's page at N. In Admin context, make one allowed detail mutation and save, leaving the item unassigned.
2. On A's old page, activate Assign to me using N.
3. Review the conflict, explicitly Refresh work item, then self-assign with the latest version.
4. Inspect final detail/activity.

**Expected:** Stale assignment returns `409`, retains visible error/local state/session, and never retries automatically. Manual refresh enables a valid retry; only its successful assignment creates activity. A forbidden stale assignment remains `403` and is a separate authorization case.

**Automation reference:** `AuthorizationApiTests.AllowedStaleMutation_ReturnsConflict_WithNoGhostActivity` (assign); `WorkItemsApiTests.StaleClientRepresentation_ReturnsConflictAndPreservesWinnerAndActivity` (assign); assignment test `shows concurrency guidance and refreshes only when explicitly requested`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D real authorized assignment `409` and explicit refresh/retry.

## Comments

### COM-001 — Persist authenticated multiline comment and activity

**Requirement:** Comments expose safe authenticated authorship and remain distinct from Activity.

**Preconditions:** A-created item with no comments; A logged in; record version/updated timestamp.

**Steps:**

1. Open detail and observe No comments yet.
2. Enter `  First line` followed by a newline and `Second line  `; submit once.
3. Inspect the `201` safe DTO, list and refreshed Activity, then reload.

**Expected:** Request contains only body. Stored outer whitespace is trimmed and internal newline retained; A's ID/displayName and server UTC timestamp appear. Draft clears, returned comment is appended, and separate CommentAdded identifies A without copying the body. No email/roles/security metadata appear in authors.

**Automation reference:** `CommentTests.Body_IsTrimmedWhileInternalWhitespaceIsPreserved`; `WorkItemCommentServiceTests.AddComment_UsesCurrentUserAndOneSaveWithoutMutatingLegacyWorkItem`; `CommentsApiTests.AnyAuthenticatedReader_CanCommentWithoutLifecyclePermission_AndAuthorComesFromJwt`; comments successful-submit test.

**Status:** Designed — not executed under this ID. Prior evidence: 4E trimmed/persisted comment, author, Activity, reload, and multiline checks.

### COM-002 — Unrelated Member contributes in deterministic order

**Requirement:** Readable comments are independent of lifecycle ownership.

**Preconditions:** A-created item with A's comment; B is unrelated and logged in.

**Steps:**

1. Open the item as B and verify A's comment is visible while Edit details is absent.
2. Add a distinct comment as B.
3. Reload both contexts and compare list order/authors with GET comments.

**Expected:** B's POST succeeds as B, not A. Both comments persist oldest-first by CreatedAtUtc then ID. Lifecycle permission restrictions remain; no author chooser exists. Timestamp/ID ties are deterministically covered by automation rather than inferred from this ordinary manual run.

**Automation reference:** `CommentsApiTests.AnyAuthenticatedReader_CanCommentWithoutLifecyclePermission_AndAuthorComesFromJwt`; `GetComments_OrdersByTimestampThenIdAscending`; comments author/multiline/order cases.

**Status:** Designed — not executed under this ID. Prior evidence: 4E unrelated B contribution and ordered conversation checks.

### COM-003 — Blank, over-limit, and failed comments

**Requirement:** Validation is authoritative and failed writes preserve the draft.

**Preconditions:** A logged in; readable item; safe one-response POST interception available.

**Steps:**

1. Submit whitespace only; inspect the announced error and textarea association.
2. Attempt a 2001-character paste and inspect the textarea's 2000-character limit; separately run `Negative Authorization / Blank comment` and `Too-long comment` to verify backend `400` for both invalid bodies.
3. Enter a valid draft; intercept its POST once with `503` and submit.
4. Remove interception and retry explicitly; inspect list/activity counts.

**Expected:** Blank UI input sends no write; direct blank/too-long API bodies return `400` and persist neither comment nor activity. A failed valid POST retains text/session and enables retry. Exactly one successful explicit retry is appended; duplicate pending submissions are guarded.

**Automation reference:** `CommentsApiTests.BlankOrNullBody_ReturnsValidationProblem_AndPersistsNeither`; `BodyLengthLimit_IsAuthoritative_AndAcceptsExactly2000`; comments validation, failed-POST, and synchronous-duplicate-guard tests.

**Status:** Designed — not executed under this ID. Prior evidence: 4E blank/error association, over-limit real `400`, intercepted failure, retained draft, and successful retry checks.

### COM-004 — Comment does not invalidate an open edit

**Requirement:** Comment creation changes neither WorkItem version nor updated timestamp and accepts no expectedVersion.

**Preconditions:** A-created item at N; A and unrelated B authenticated in separate contexts.

**Steps:**

1. As A, open Edit details at N and type a draft without saving.
2. As B, add a body-only comment; GET detail and compare version/updated timestamp with the recorded values.
3. Submit A's existing modal with expectedVersion N.
4. Inspect the successful edit and persisted comment/activity.

**Expected:** Comment leaves version/timestamp unchanged. A's original edit still succeeds with N and receives the server's next version. The open draft/focus is retained; no comment-caused detail refresh or lifecycle mutation lock occurs.

**Automation reference:** `CommentsApiTests.OtherUserComment_DoesNotInvalidateAnOpenEditVersion`; detail tests `preserves an open edit snapshot while a pending comment completes and submits the same expectedVersion` and `refreshes CommentAdded activity after POST without fetching detail or altering the status expectedVersion`.

**Status:** Designed — not executed under this ID. Prior evidence: 4E real version 1 → comments still 1 → existing edit submits 1 and returns 2.

## Responsive layout and keyboard

### UX-001 — Mobile login and validation focus

**Requirement:** Authentication controls remain labelled, readable, and keyboard usable at 390 × 844.

**Preconditions:** Signed-out mobile-sized browser; A exists.

**Steps:**

1. Open `/login` at 390 × 844; submit empty fields and observe focus/errors.
2. Fill email/password using Tab, then submit using Enter.
3. Open mobile navigation, cycle Tab/Shift+Tab, and press Escape.

**Expected:** No horizontal overflow or clipped controls; clear labels and autocomplete attributes; invalid-field focus and associated errors; successful login. Navigation traps focus while open and Escape restores its trigger.

**Automation reference:** `AuthPages.test.tsx` — `requires email and password, focuses the first invalid field, and does not submit`; expired-session/autocomplete case; `AuthRoutes.test.tsx` navigation/header cases. Navigation focus/visual layout additionally require rendered-browser evidence.

**Status:** Designed — not executed under this ID. Prior evidence: 4C mobile keyboard login/validation/navigation checks, retained in 4D/4E.

### UX-002 — Mobile work item and edit modal

**Requirement:** Detail/cards, assignment/history/comments, and modal focus work at mobile width.

**Preconditions:** A logged in; long multiline description/comment and legacy-name fixture available.

**Steps:**

1. At 390 × 844, inspect list cards and detail with long current/historical assignment and comment text.
2. Open Edit details by keyboard; cycle Tab/Shift+Tab and close with Escape.
3. Reopen and save one detail change, allowing Activity to finish before close.

**Expected:** Text wraps, no page-wide overflow/nested interactive controls, and Activity remains separate from Comments. Modal traps focus; Escape and successful save restore Edit details, including when Activity completes while open.

**Automation reference:** `WorkItemAssignee.test.tsx` table/card cases; detail test `traps keyboard focus and restores Edit details after Escape (activity completes while open: %s)`; `restores edit trigger focus after saving and completing a delayed activity refresh`.

**Status:** Designed — not executed under this ID. Prior evidence: 4D mobile card/detail/modal and 4E long/multiline comments checks.

### UX-003 — Keyboard assignment

**Requirement:** Server-permitted real user assignment is usable without a pointer.

**Preconditions:** Admin logged in; ordinary unassigned item; active A and B exist.

**Steps:**

1. At mobile width, Tab to Change assignment and activate Enter.
2. Focus Assign to; select B with native select keys.
3. Tab to Save assignment and activate Enter, then focus Unassign and activate Enter.

**Expected:** Select/button labels are clear; only selected user IDs/null are sent with current versions. Directory loads lazily and pending actions prevent duplicate requests. Both permitted mutations succeed and display returned assignment/capabilities.

**Automation reference:** assignment test `uses an accessible native select and a keyboard-operable save action`; `guards rapid assignment actions while the request is pending`; Admin assignment PostgreSQL cases.

**Status:** Designed — not executed under this ID. Prior evidence: 4D mobile native-select/Tab/Enter assignment and unassignment.

### UX-004 — Keyboard comments and route isolation

**Requirement:** Comment form submission is accessible and old requests cannot contaminate another item.

**Preconditions:** A logged in; two readable items; optional controlled delayed GET/POST responses on the disposable browser only.

**Steps:**

1. At 390 × 844, focus Add a comment, type multiline plain text, Tab to Add comment, and press Enter.
2. Inspect the appended comment, cleared textarea, Activity, and wrapping.
3. For a separate controlled race check, delay item A's comments request, navigate to B, type a B draft, then release A's response/error.

**Expected:** Keyboard flow succeeds, text is escaped and wraps, and pending state/errors are announced. A's late result cannot appear on B, clear its draft, change its submitting/loading state, or refresh B's Activity.

**Automation reference:** comments test `supports textarea Tab then Enter keyboard submission`; parameterized late-list/late-submit cases; `ignores an old retry error after the next work item loads`; detail test `does not apply an old route comment POST or refresh the next route activity (error: %s)`.

**Status:** Designed — not executed under this ID. Prior evidence: 4E mobile keyboard/wrapping flow; the controlled route-race branch has deterministic automated evidence and is not claimed as a prior browser execution.
