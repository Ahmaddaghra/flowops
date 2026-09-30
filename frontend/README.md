# FlowOps Frontend

React 19, TypeScript, Vite, Tailwind, and React Router provide the responsive work item client. Stage 4C adds authentication on top of the reviewed backend Identity/JWT foundation. User-backed assignment controls and comments remain later-stage work.

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

## Work item compatibility and scope

Create sends `assigneeUserId: null`; the old free-text assignment fields are removed. Detail displays the current user assignee separately from any read-only historical Phase 3 name. Activity displays the server-resolved actor name, with `System` for historical null actors. Existing edit/status requests keep the returned `expectedVersion`, safe concurrency errors, and protection against stale route responses.

Stage 4D will add real assignment controls and permission-aware mutation UX. The server already enforces permissions, and a forbidden edit/status response is shown without logging the user out. When a legacy item has both creator and user assignee IDs null, only Admin may edit, change status, or assign it; a Member cannot self-assign it. An Admin's legitimate user assignment establishes the assignee's ordinary permissions, and removing that assignment restores the Admin-only boundary when creator remains null. Historical names do not confer rights. No user-directory picker, self-assignment controls, comments, or Phase 5 dashboard feature is implemented in Stage 4C. Expanded Postman workflows and manual QA artifacts remain pending later Phase 4 stages.

Stage 4C passed 115 Vitest/React Testing Library tests across nine files, formatting, lint with zero warnings/errors, and production build. Coverage exercises auth forms, route guards, session restoration/logout, central token behavior, stale/concurrent auth results, permission errors, and retained work item concurrency/navigation behavior. Seventeen Chromium checks passed against the real API and a disposable database at desktop and mobile sizes, including real authentication, intended routes, reload, create/detail compatibility, session-preserving `403`, recoverable `/me` network failure, and mobile keyboard/navigation focus. The Browser plugin was unavailable, so verification used the existing bundled Playwright fallback without adding repository dependencies. Detailed evidence is recorded in the [Phase 4 checkpoint](../docs/phases/phase-4-auth-collaboration-qa.md).
