# FlowOps

A full-stack operations and support workflow platform built to demonstrate clean application architecture, API design, responsive UI, testing, and collaborative engineering practices.

FlowOps helps small teams create, assign, prioritize, track, and audit work items from intake to resolution. The project is intentionally scoped as a production-style portfolio application rather than a tutorial clone.

## Planned stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** ASP.NET Core Web API, C#/.NET
- **Data:** PostgreSQL, Entity Framework Core
- **API tooling:** OpenAPI/Swagger, Postman
- **Testing:** xUnit, ASP.NET integration tests, React Testing Library
- **Engineering:** Git/GitHub, GitHub Actions, structured pull requests, linting/formatting

## Core product scope

- Authentication and role-aware access
- Work item / support request creation and editing
- Assignment, priority, status, and category management
- Search, filters, sorting, and pagination
- Comments and activity history
- Dashboard metrics and workload summary
- Responsive, accessible interface
- API documentation and regression coverage

## Repository structure

```text
flowops/
├── backend/                  # ASP.NET Core API (implemented in Phase 1+)
├── frontend/                 # React client (implemented in Phase 2+)
├── docs/
│   ├── PROJECT_PLAN.md       # Phases, gates, and definition of done
│   ├── ARCHITECTURE.md       # Architecture and domain boundaries
│   ├── DATA_MODEL.md         # Initial entities and relationships
│   └── API_DESIGN.md         # REST conventions and endpoint plan
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── .editorconfig
├── .gitignore
├── CONTRIBUTING.md
└── LICENSE
```

## Engineering principles

1. Every feature starts from a clear requirement and acceptance criteria.
2. Business rules stay out of UI components and controllers.
3. API behavior is documented and testable.
4. Database migrations are reviewed and reproducible.
5. Pull requests stay small enough to review.
6. A feature is not done until its happy path, validation, error states, and relevant tests are covered.

## Current status

**Phase 0 — Repository & architecture baseline**

Implementation starts with the backend foundation, followed by the frontend shell and then vertical feature slices. See [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md).

## License

MIT.
