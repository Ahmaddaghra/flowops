# Contributing

FlowOps is a portfolio project, but it follows a reviewable engineering workflow.

## Workflow

1. Create a focused issue or define acceptance criteria.
2. Branch from current `main`.
3. Make small, coherent commits.
4. Add or update tests with behavioral changes.
5. Open a pull request using the repository template.
6. Merge only when build, lint, and tests pass.

## Pull request size

Prefer one vertical capability or one infrastructure concern per PR. Avoid mixing broad refactors with unrelated feature work.

## Code quality

- no committed secrets;
- no commented-out abandoned code;
- no placeholder tests that always pass;
- explain non-obvious design choices;
- keep public API contracts intentional;
- treat warnings as problems to understand, not suppress by default.
