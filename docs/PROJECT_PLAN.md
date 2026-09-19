# FlowOps Project Plan

## Objective

Build a portfolio-grade full-stack application that demonstrates practical competence in React, Tailwind CSS, ASP.NET Core/.NET, REST APIs, SQL, testing, responsive UI, Git/GitHub workflow, API tooling, and maintainable code.

The project will be delivered in **seven controlled phases**. Each phase has explicit outputs and a gate. A phase is not considered complete until its gate passes.

---

## Phase 0 — Repository, Product Scope & Architecture Baseline

**Goal:** establish a professional project foundation before writing feature code.

### Deliverables
- Repository structure and conventions
- Product scope and non-goals
- Initial architecture decision
- Initial domain model
- API conventions
- PR and issue templates
- Formatting/editor conventions

### Gate
- README explains the product and stack clearly
- Architecture is documented enough to begin implementation
- No speculative feature creep in scope
- First implementation tasks are small and independently reviewable

---

## Phase 1 — Backend Foundation

**Goal:** create a clean, testable ASP.NET Core API and persistence baseline.

### Deliverables
- ASP.NET Core Web API solution
- Layered project structure (API / Application / Domain / Infrastructure or a deliberately simplified equivalent)
- PostgreSQL connection via Entity Framework Core
- Initial migrations
- Health endpoint
- OpenAPI/Swagger
- Environment configuration without committed secrets
- Baseline xUnit test project
- CI job for build + tests + formatting

### Initial domain
- User
- WorkItem
- Comment
- ActivityEvent
- Category

### Gate
- API builds from a clean checkout
- Database can be created from migrations
- Health endpoint responds successfully
- Swagger loads and documents the API
- Backend test suite passes in CI

---

## Phase 2 — Frontend Foundation & Design System

**Goal:** establish the React/Tailwind application shell and reusable UI primitives.

### Deliverables
- React + TypeScript + Vite application
- Tailwind CSS configured
- Routing and top-level layout
- Responsive sidebar/header/navigation
- Shared button/input/select/badge/modal/table components
- Loading, empty, validation, and error states
- API client layer and environment configuration
- ESLint/Prettier and frontend CI checks

### Gate
- Application works on desktop and mobile widths
- No feature page directly hard-codes API transport logic
- Reusable components cover common visual patterns
- Frontend lint/build checks pass in CI

---

## Phase 3 — Core Vertical Slice: Work Item Lifecycle

**Goal:** deliver the first end-to-end feature through database, API, tests, and UI.

### Deliverables
- Create work item
- List work items
- Work item details
- Edit title/description/category/priority
- Status transition workflow
- Assignment
- Search, filtering, sorting, and pagination
- Server-side validation and consistent error responses
- Activity history for meaningful changes

### Required tests
- Domain/application rules
- API integration tests for create/read/update flows
- Validation failure tests
- Frontend component tests for critical states

### Gate
- A user can complete the main workflow entirely through the UI
- Invalid state transitions are rejected server-side
- Main REST endpoints are represented in Swagger and Postman
- Critical behavior has automated regression coverage

---

## Phase 4 — Authentication, Collaboration & QA Depth

**Goal:** add realistic user boundaries and demonstrate QA discipline.

### Deliverables
- Authentication using a documented approach (JWT-based API auth)
- Roles or permissions appropriate to the app
- Comments on work items
- Ownership/assignment restrictions
- Manual test cases for critical flows
- Bug report examples with reproducible steps
- Postman collection with environment variables and representative test scripts
- Negative API tests (authorization, invalid IDs, malformed data, conflicts)

### Gate
- Protected routes and endpoints cannot be accessed without valid authorization
- Role boundaries are verified by integration tests
- Manual QA artifacts are concise, reproducible, and aligned with requirements
- Postman collection can exercise the main API from a clean local environment

---

## Phase 5 — Dashboard, UX Polish & Figma Traceability

**Goal:** demonstrate responsive UI/UX judgment rather than only functional screens.

### Deliverables
- Dashboard cards and simple workload metrics
- Status/priority distribution views
- Responsive table/card behavior
- Accessible labels, keyboard-friendly interactions, focus states
- Figma file for key screens and reusable design tokens/components
- Screenshots/GIFs for README
- UX review for loading, empty, success, warning, and failure states

### Gate
- Main flows are usable at common mobile, tablet, and desktop widths
- UI implementation is visibly traceable to the design
- No major layout breakage or inaccessible form controls
- README includes current product screenshots

---

## Phase 6 — Reliability, CI & Production-Style Quality

**Goal:** make the repository look and behave like maintained software.

### Deliverables
- GitHub Actions for frontend + backend
- Test coverage on core behavior (coverage number is informative, not a vanity target)
- Structured logging and global error handling
- Database seed strategy for development/demo data
- Basic security review (secrets, auth, validation, CORS, input handling)
- Dependency/update review
- Optional Docker Compose for app dependencies if it improves reproducibility

### Gate
- Clean clone can be configured from documented steps
- CI is green
- No secrets are committed
- Core user journey is covered by repeatable tests
- Known limitations are documented rather than hidden

---

## Phase 7 — Portfolio Release

**Goal:** turn the engineering work into a reviewer-friendly public artifact.

### Deliverables
- Final README with architecture, features, setup, screenshots, API docs, tests, and trade-offs
- Public demo or recorded walkthrough if practical
- GitHub release/tag `v1.0.0`
- Curated commit history and merged feature PRs
- Closed milestone/issues for the MVP
- Final CV-ready project summary

### Gate
A technical reviewer should be able to answer these questions in under five minutes:
1. What problem does FlowOps solve?
2. What stack is used?
3. What did the developer implement personally?
4. How is the code structured?
5. How is behavior tested?
6. How do I run it?
7. What engineering trade-offs were made?

---

## Suggested execution order

Do not implement entire backend and entire frontend separately. After Phases 1–2, work in **vertical slices**: one requirement from database -> API -> tests -> UI -> QA evidence. This produces reviewable pull requests and reduces integration risk.

## Branch strategy

- `main` — always reviewable and buildable
- `feature/<short-scope>` — implementation branches
- `fix/<short-scope>` — defect fixes
- `docs/<short-scope>` — substantial documentation-only changes

Examples:
- `feature/backend-foundation`
- `feature/frontend-shell`
- `feature/work-item-create`
- `feature/work-item-filters`
- `feature/authentication`
- `test/api-regression`

## Commit convention

Prefer focused conventional-style commits:

```text
feat(api): add work item creation endpoint
feat(web): add responsive work item table
fix(api): reject invalid status transitions
test(api): cover assignment authorization
docs: add local development instructions
```

## Definition of Done

A feature is done only when:
- acceptance criteria are met;
- error/empty/loading states are handled where relevant;
- server-side validation exists for business constraints;
- tests cover the important behavior;
- API documentation is updated;
- no secrets or machine-specific paths are committed;
- lint/build/tests pass;
- the PR explains scope, testing, and screenshots when UI changed.

## Scope control

### MVP
- auth
- work items
- assignment
- status/priority/category
- filters/search/pagination
- comments/history
- dashboard
- API docs
- tests

### Explicitly deferred unless time remains
- real-time WebSockets
- file uploads
- email notifications
- multi-tenant billing
- complex analytics
- mobile native application
- AI features added only for novelty

The MVP is intentionally focused on the core engineering skills the stack is meant to demonstrate.
