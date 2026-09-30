# FlowOps Frontend

React 19, TypeScript, Vite, Tailwind, and React Router provide the responsive work item client. Stage 4C adds authentication on top of the reviewed backend Identity/JWT foundation. Stage 4D adds capability-driven edit/status controls and real user assignment. Stage 4E adds authenticated plain-text comments below Activity; its checkpoint is completed and verified.

## Run and verify

Start the configured backend on `http://localhost:5055` using the [root setup](../README.md), then from `frontend/` run:

```bash
npm ci
npm run dev
```

Vite serves `http://localhost:5173` and proxies `/api` to the backend. The client defaults to `/api/v1`; an optional frontend `.env` may set `VITE_API_BASE_URL=/api/v1`. Keep the configured API base on the app's origin. Bearer tokens are restricted to the intersection of that base path and the same-origin `/api/v1` scope, so an external or broader URL never receives the session token.

The existing frontend quality gates remain:

```bash
npm run format:check
npm run lint
npm run test -- --run
npm run build
```

## Authentication flow

`/login` and `/register` are public. `/`, `/work-items`, `/work-items/:id`, `/settings`, and the `/dashboard` placeholder require a verified authenticated session. Anonymous navigation records the requested internal path, query, and hash before opening login. After login or registration, a centralized validator accepts only known internal application routes; external destinations fall back to `/work-items`. Authenticated users reaching a login/register page return to a safe intended location.

Registration submits only email, password, and display name. The real backend creates a Member and returns an access token plus safe user information; there is no role selector or simulated identity. Forms provide labels, client validation, server field errors, submission guards, password-manager attributes, and focus on invalid fields. The header displays the actual user's name/roles and a logout action.

Context/hooks expose auth state backed by a shared session store. Only access token and expiry metadata are persisted in sessionStorage; user objects and role snapshots are not persisted. Reloading validates the restored token through authoritative `/auth/me` before protected content renders. Initialization shows a loading state. A connection/server failure retains the token and offers retry or explicit sign out; a real `401` clears the matching session and returns to login. Storage failures allow the current session to continue in memory.

The centralized API client attaches bearer headers for trusted protected API calls. Register, login, and public health use `auth: false`, attaching no bearer and never invalidating an existing session. A protected `401` clears storage only when the request's token and session revision still match the current session. Late failures from an older session cannot erase a newer login, and concurrent failures invalidate once. Provider guards likewise prevent late `/me` or login results from restoring a signed-out user. A `403` preserves the session and presents the permission error. Client route/session guards provide UX; backend authentication and authorization remain authoritative for every protected API operation.

There is no refresh token, revocation service, or client idle-expiry timer. Expiry metadata is retained for session state, while API `401` responses and reload-time `/me` validation establish expiry authoritatively. SessionStorage still carries XSS risk; a production deployment may move toward secure server-managed/httpOnly sessions.

## Work item permissions and assignment

Create sends `assigneeUserId: null`; creator identity comes from the JWT. Detail, desktop table, and mobile cards show the real assignee display name when an assignment user ID exists. A missing user summary displays Assigned user unavailable rather than substituting a legacy name. With no current user assignment, a snapshot displays Historical assignment: NAME, or Unassigned when neither exists. Compatibility `assigneeName` never establishes identity. Activity displays the server-resolved actor name, with `System` for historical null actors. The name filter matches current display names and historical snapshots only when no user is assigned, following the backend query contract.

The server's `canEdit`, `canChangeStatus`, `canAssign`, `canSelfAssign`, `canUnassign`, and `canAssignOthers` capabilities drive the controls. Missing/null permissions hide mutation actions. The UI does not reconstruct the role/ownership matrix or derive rights from names. Edit details and status transition buttons appear only when permitted; the backend still rechecks every request.

The Admin flow requires `canAssign` and `canAssignOthers`: Change assignment lazily requests `/users`, then an accessible Assign to select and Save assignment use the selected user's ID. An independent Unassign action sends null when permitted. The directory returns only active users' `{ id, displayName }` summaries, with loading, empty, isolated error, and retry states. Members and callers without directory capability never request it. Permitted Members use Assign to me with the verified current user's ID, or Unassign me with null; they do not receive a user picker.

Assignment sends `{ assigneeUserId, expectedVersion: item.version }`. A successful response replaces the current item, including its new version and capabilities, before later mutations. A shared detail-page mutation gate serializes edit/status/assignment and blocks rapid duplicate submissions; route-scoped guards keep late mutations or directory results from contaminating a different item. A mutation `403` retains the session, item, and visible permission error without automatic refresh. A stale `409` provides manual refresh/review guidance and never retries automatically. Protected `401` continues through the central session invalidation flow.

When a legacy item has both creator and user assignee IDs null, only Admin may edit, change status, or assign it; a Member cannot self-assign it. An Admin's legitimate user assignment establishes the assignee's ordinary permissions, and removing that assignment restores the Admin-only boundary when creator remains null. Historical names do not confer rights. Comments follow the authenticated read boundary, including on legacy items. Expanded Postman/manual QA artifacts and Phase 5 dashboard features remain deferred.

## Work item comments

The typed central `workItemsApi.getComments/addComment` methods use the existing client and session behavior. POST sends only `{ body }`. The Comments card below Activity owns loading, empty, isolated error/retry, and submitting states. Each oldest-first entry displays the safe author's name, formatted timestamp, and escaped plain text with preserved newlines and long-word wrapping. Comment bodies never render as HTML or become Activity descriptions.

The labelled textarea allows up to 2000 characters, rejects blank submissions, associates errors accessibly, guards duplicate writes, retains failed drafts, and clears after success. A successful POST appends its returned comment and refreshes Activity only; it does not refetch detail or change the local WorkItem version. Comments stay independent of the edit/status/assignment mutation gate, so an edit opened at version N remains valid after another user comments.

The component is keyed by work item ID. Unmount/request guards suppress old list, submit, error, and retry results after navigation; old submissions cannot clear a new route's draft or refresh its activity. List merging preserves successful new comments when an older GET finishes later. Sorting retains timestamp fractions before the ID tie-breaker. Central `401` invalidation and session-preserving `403` behavior are unchanged.

Stage 4E passes 204 tests across 14 files, adding 38 cases while retaining all 166 Stage 4D tests. `npm ci` reports zero audit vulnerabilities; format, lint, and TypeScript/Vite build pass. Twenty Chromium checks against the real API and isolated PostgreSQL verify two Member authors, activity, unchanged versions, open-edit compatibility, failure/retry, logout/real `401`, mobile wrapping, keyboard submission, and navigation focus. Three screenshots were inspected; there are zero unexpected runtime or console errors. Deliberate `403` and `503` browser failures were intercepted. This is local Chromium coverage; Stage 4F artifacts have not begun.

## Historical verification

The historical Stage 4C checkpoint passed 115 Vitest/React Testing Library tests across nine files, formatting, lint with zero warnings/errors, and production build. Coverage exercised auth forms, route guards, session restoration/logout, central token behavior, stale/concurrent auth results, permission errors, and retained work item concurrency/navigation behavior. Seventeen Chromium checks passed against the real API and a disposable database at desktop and mobile sizes, including real authentication, intended routes, reload, create/detail compatibility, session-preserving `403`, recoverable `/me` network failure, and mobile keyboard/navigation focus. The Browser plugin was unavailable, so verification used the existing bundled Playwright fallback without adding repository dependencies.

The historical Stage 4D checkpoint passed 166 frontend tests across 12 files, adding 51 cases over Stage 4C. Preflight `npm ci` reported zero audit vulnerabilities; formatting, lint with zero warnings/errors, and TypeScript/Vite production build pass. The unchanged backend passes all 82 unit tests and 102 PostgreSQL integration cases, with restore, formatting, and build passing without warnings/errors. Twenty-three real Admin/Member browser checks pass at 1440 × 1000 desktop and 390 × 844 mobile sizes, including assignment `401`/`403`/`409`, directory retry, keyboard selection, and dialog/navigation focus restoration; there are zero unexpected runtime or console errors. Four screenshots were inspected; detailed evidence is recorded in the [Phase 4 checkpoint](../docs/phases/phase-4-auth-collaboration-qa.md).
