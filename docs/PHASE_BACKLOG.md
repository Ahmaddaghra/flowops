# Phase Backlog

This backlog converts the project plan into reviewable implementation units. Issue titles are intentionally small enough to map cleanly to feature branches and pull requests.

## Phase 0 — Baseline

- [x] `chore: establish repository conventions and documentation`
- [ ] `docs: finalize MVP acceptance criteria`
- [ ] `docs: record initial architecture decisions`

## Phase 1 — Backend Foundation (Complete)

1. [x] `chore(api): scaffold ASP.NET Core solution and test projects`
2. [x] `feat(api): configure PostgreSQL and EF Core persistence`
3. [x] `feat(api): add initial domain entities and migrations`
4. [x] `feat(api): add health endpoint and OpenAPI documentation`
5. [x] `test(api): establish integration test harness`
6. [x] `ci(api): add backend build and test workflow`

**Phase exit:** clean checkout builds, migrates database, loads Swagger, and passes CI.

## Phase 2 — Frontend Foundation (Complete)

1. [x] `chore(web): scaffold React TypeScript application`
2. [x] `style(web): configure Tailwind CSS and design tokens`
3. [x] `feat(web): add responsive application shell and routing`
4. [x] `feat(web): add reusable form and feedback components`
5. [x] `feat(web): add typed API client and error handling`
6. [x] `ci(web): add frontend lint build and test workflow`

**Phase exit:** responsive shell builds cleanly and has predictable loading/error behavior.

## Phase 3 — Core Work Item Vertical Slices (Complete)

1. [x] `feat(work-items): create work item`
2. [x] `feat(work-items): list and paginate work items`
3. [x] `feat(work-items): add details view`
4. [x] `feat(work-items): edit core fields`
5. [x] `feat(work-items): enforce status transitions`
6. [x] `feat(work-items): assign display names`
7. [x] `feat(work-items): add search filters and sorting`
8. [x] `feat(activity): record and display work item history`
9. [x] `test(api): cover lifecycle with PostgreSQL integration tests`
10. [x] `test(web): cover critical lifecycle UI paths`
11. [x] `docs(api): publish v1 contract and Postman collection`

Each issue should include API, persistence, tests, and UI when applicable rather than splitting a user capability by technology layer.

**Phase exit:** full create -> triage -> assign -> progress -> resolve workflow works through the UI and API.

## Phase 4 — Authentication, Collaboration & QA (In Progress)

The Stage 4A/4B checkpoint was reviewed before beginning frontend authentication, and Stage 4C was subsequently reviewed. Stage 4D's capability-driven assignment/edit/status controls are completed and verified, including 166 frontend tests, 82 backend unit tests, 102 PostgreSQL integration cases, and 23 real-identity browser checks. Stage 4E comments have not started. See the [Phase 4 checkpoint](phases/phase-4-auth-collaboration-qa.md).

The final Stage 4C preflight also tightened the existing legacy boundary: an item with both creator and user assignee IDs null permits only Admin work item mutations, including assignment, until an Admin legitimately assigns a user. This focused backend correction adds regression coverage without beginning Stage 4D UI work.

1. [x] `feat(auth): add Identity schema, Member/Admin roles, JWT register/login/me, and user directory` (Stage 4A)
2. [x] `feat(authz): add user-backed ownership/assignment and enforce role/ownership rules without weakening concurrency` (Stage 4B)
3. [x] `test(api): verify authentication/authorization boundaries and additive migration compatibility` (Stage 4A/4B)
4. [x] `feat(web): add auth state, login/register, protected routes, token-aware client, and logout` (Stage 4C)
5. [x] `feat(web): add permission-aware user assignment controls and regression tests` (Stage 4D)
6. [ ] `feat(comments): add persisted comments, authenticated actors, activity, UI, and tests` (Stage 4E)
7. [ ] `test(api): expand remaining negative-path workflows and authenticated Postman requests` (Stage 4F)
8. [x] `test(postman): publish baseline API collection and environment template` (delivered in Phase 3; Phase 4 auth expansion pending)
9. [ ] `docs(qa): add manual test suite, real development bug reports, and requirement traceability` (Stage 4F)
10. [ ] `docs: finish Phase 4 documentation, browser QA, CI verification, and PR delivery` (Stage 4G)

**Phase exit:** protected workflows are verified both manually and through integration tests.

## Phase 5 — Dashboard & UX

1. `feat(dashboard): add workload summary endpoint`
2. `feat(dashboard): add responsive dashboard UI`
3. `ux: implement polished empty loading success and error states`
4. `ux: complete accessibility and responsive review`
5. `docs(design): link Figma designs and implementation screenshots`

**Phase exit:** reviewer can understand the product visually without running it first.

## Phase 6 — Reliability & Engineering Quality

1. `refactor(api): add consistent global error handling`
2. `chore(logging): add structured application logging`
3. `chore(data): add reproducible demo seed data`
4. `ci: combine required frontend and backend quality gates`
5. `security: complete baseline secrets auth CORS and validation review`
6. `docs: verify clean-clone setup instructions`
7. `chore(dev): add Docker Compose only if it improves reproducibility`

**Phase exit:** new developer can clone, configure, run, and test the project from documentation.

## Phase 7 — Portfolio Release

1. `docs: publish final architecture and trade-offs`
2. `docs: add screenshots and demo workflow`
3. `docs: publish testing strategy and commands`
4. `release: close MVP issues and tag v1.0.0`

**Release exit:** repository is concise, green, documented, and reviewer-friendly.
