# Phase Backlog

This backlog converts the project plan into reviewable implementation units. Issue titles are intentionally small enough to map cleanly to feature branches and pull requests.

## Phase 0 — Baseline

- [x] `chore: establish repository conventions and documentation`
- [ ] `docs: finalize MVP acceptance criteria`
- [ ] `docs: record initial architecture decisions`

## Phase 1 — Backend Foundation

1. `chore(api): scaffold ASP.NET Core solution and test projects`
2. `feat(api): configure PostgreSQL and EF Core persistence`
3. `feat(api): add initial domain entities and migrations`
4. `feat(api): add health endpoint and OpenAPI documentation`
5. `test(api): establish integration test harness`
6. `ci(api): add backend build and test workflow`

**Phase exit:** clean checkout builds, migrates database, loads Swagger, and passes CI.

## Phase 2 — Frontend Foundation

1. `chore(web): scaffold React TypeScript application`
2. `style(web): configure Tailwind CSS and design tokens`
3. `feat(web): add responsive application shell and routing`
4. `feat(web): add reusable form and feedback components`
5. `feat(web): add typed API client and error handling`
6. `ci(web): add frontend lint build and test workflow`

**Phase exit:** responsive shell builds cleanly and has predictable loading/error behavior.

## Phase 3 — Core Work Item Vertical Slices

1. `feat(work-items): create work item`
2. `feat(work-items): list and paginate work items`
3. `feat(work-items): add details view`
4. `feat(work-items): edit core fields`
5. `feat(work-items): enforce status transitions`
6. `feat(work-items): assign users`
7. `feat(work-items): add search filters and sorting`
8. `feat(activity): record and display work item history`

Each issue should include API, persistence, tests, and UI when applicable rather than splitting a user capability by technology layer.

**Phase exit:** full create -> triage -> assign -> progress -> resolve workflow works through the UI and API.

## Phase 4 — Authentication, Collaboration & QA

1. `feat(auth): add JWT authentication`
2. `feat(auth): enforce role and ownership rules`
3. `feat(comments): add work item comments`
4. `test(api): add authorization and negative-path regression cases`
5. `test(postman): publish API collection and environment template`
6. `docs(qa): add manual test suite and representative bug reports`

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
