# FlowOps Backend

The backend is a .NET 10 Web API organized into Domain, Application, Infrastructure, and API projects. PostgreSQL stores work items, comments, and ASP.NET Core Identity data. Domain stays independent of Identity; Application uses app-level identity/current-user abstractions and does not reference EF Core or Identity. The reviewed Stage 4A/4B foundation provides JWT authentication and server-side work item authorization. Stage 4C's authenticated frontend and Stage 4D's capability-driven assignment/edit/status controls consume these existing contracts. Stage 4E adds authenticated comments and atomic comment/activity persistence. Remaining Phase 4 QA artifacts are deferred.

## Authentication configuration

The committed JWT settings contain only issuer `FlowOps.Api`, audience `FlowOps.Web`, and `AccessTokenMinutes: 60`. Configure `Jwt:SigningKey` privately before starting the API. The key must contain at least 32 UTF-8 bytes, and invalid JWT configuration fails startup clearly.

From the repository root, generate and store a local signing key in the API project's user-secrets:

```bash
dotnet user-secrets set "Jwt:SigningKey" "$(openssl rand -base64 48)" \
  --project backend/src/FlowOps.Api/FlowOps.Api.csproj
```

An environment-provided `Jwt__SigningKey` is also supported, with `FLOWOPS_JWT_SIGNING_KEY` as a fallback. Tokens use HS256, validate issuer/audience/signature/lifetime, and use zero clock skew. Token lifetime can be configured from 1 to 1,440 minutes and defaults to 60. Never commit signing keys, passwords, or real access tokens to appsettings, `.env.example`, or Postman assets. Phase 4 includes no refresh token, token revocation, password-reset email, OAuth, or social login infrastructure.

### Optional Development admin

Registration always creates a Member. The optional local admin bootstrap runs only in Development and uses these configuration/environment values:

- `FLOWOPS_SEED_ADMIN_EMAIL`
- `FLOWOPS_SEED_ADMIN_PASSWORD`
- `FLOWOPS_SEED_ADMIN_DISPLAY_NAME`

No default admin credentials are committed. Supply all three private values through environment configuration or user-secrets; missing required values skip admin creation. An existing Admin account is left unchanged; the bootstrap refuses to promote an existing non-admin account with the configured email. For user-secrets, set each value against `backend/src/FlowOps.Api/FlowOps.Api.csproj` using `dotnet user-secrets set`. Do not enable this workflow by putting credentials in application source. Identity role definitions use deterministic Admin and Member names; integration tests create their own users independently of this bootstrap.

The password policy requires at least eight characters, uppercase, lowercase, and a digit; a special character is optional. Email addresses are unique, including a database unique index on normalized email. Five failed access attempts lock the account for 15 minutes. Login errors use the generic `Invalid email or password.` message for wrong credentials, inactive accounts, and locked-out accounts.

## Run locally

From the repository root, start PostgreSQL using the root setup instructions. EF tooling requires an explicit database connection string and uses its design-time DbContext factory independently of runtime JWT validation. Export the disposable Docker defaults below (adjust them to your local `.env` values if customized), apply migrations, and configure the private JWT key above before launching the API:

```bash
export ConnectionStrings__DefaultConnection='Host=localhost;Port=5432;Database=flowops;Username=flowops;Password=flowops_dev_pass_123'

dotnet ef database update \
  --project backend/src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj \
  --startup-project backend/src/FlowOps.Api/FlowOps.Api.csproj

ASPNETCORE_ENVIRONMENT=Development \
dotnet run \
  --project backend/src/FlowOps.Api/FlowOps.Api.csproj \
  --no-launch-profile \
  --urls http://localhost:5055
```

The Development connection string is local-only. For another database, supply `ConnectionStrings__DefaultConnection` through the environment instead of committing credentials. Swagger UI is served at `/swagger` in Development and supports bearer authorization. Register or log in through `/api/v1/auth`, then authorize requests using the returned access token. Health remains public; work items, categories, user directory, and `/auth/me` require authentication.

## Verify

```bash
dotnet restore backend/FlowOps.sln
dotnet format backend/FlowOps.sln --verify-no-changes --no-restore
dotnet build backend/FlowOps.sln --no-restore
dotnet test backend/tests/FlowOps.UnitTests/FlowOps.UnitTests.csproj --no-build
```

The API integration tests require a dedicated PostgreSQL database. They create a unique schema, run migrations and HTTP tests within it, and drop that schema afterward:

```bash
FLOWOPS_TEST_CONNECTION='Host=localhost;Port=5432;Database=flowops_integration;Username=flowops_test;Password=flowops_test' \
dotnet test backend/tests/FlowOps.IntegrationTests/FlowOps.IntegrationTests.csproj
```

Use a disposable test database; the integration fixture creates and drops schemas in the configured database. GitHub Actions provisions PostgreSQL 17 for this job. Integration tests inject deterministic test-only JWT configuration and create their own users/roles; no developer JWT key, admin seed, or GitHub secret is required.

The historical Stage 4A/4B checkpoint passed 80 unit tests and 100 PostgreSQL integration cases. Stage 4C's final legacy-authorization correction passed 82 unit tests and 102 PostgreSQL integration cases, with restore, formatting, and full build passing without warnings/errors. Stage 4D changes no backend code and reran the same 82 unit/102 PostgreSQL integration cases successfully, with no failures or skips and the same clean quality gates. Migration verification preserved six existing Phase 3 work items and 15 activity events through up/down-to-Phase-3/up in a disposable copy of the development database. The source database was untouched; detailed evidence is in the [Phase 4 checkpoint](../docs/phases/phase-4-auth-collaboration-qa.md).

## Stage 4E comments verification

Stage 4E passes all 110 unit tests and 133 PostgreSQL integration cases, adding 28 unit and 31 integration cases to the approved Stage 4D baseline. Restore, whole-solution formatting verification, and build pass with zero warnings/errors and no failed/skipped tests. The additive `20260930092502_AddWorkItemComments` migration passes Stage 4D → latest → Stage 4D → latest verification with existing work items, versions, activity, users, roles, and assignment references preserved. Rolling it down discards Stage 4E comments. Fault-injection tests prove comment and activity inserts roll back together in PostgreSQL.

`GET` and `POST /api/v1/work-items/{id}/comments` use the existing authenticated Admin/Member read boundary. POST accepts only `body`, trims it, rejects blank or over-2000-character input, derives authorship from the current user, and saves `CommentAdded` with the comment once. Comments are oldest-first and expose safe ID/display-name author summaries. They leave WorkItem version and updated timestamp unchanged and require no expectedVersion. Issued JWT claims retain the existing expiry semantics; deactivation is checked by login and `/auth/me`, without a new per-comment account check or revocation service.

## API

The implemented contract is documented in [API Design](../docs/API_DESIGN.md), and the authorization and migration decisions are in the [Phase 4 checkpoint](../docs/phases/phase-4-auth-collaboration-qa.md). Stage 4F expands `docs/postman/` with placeholder-only authenticated Admin/Member workflows and representative negative/conflict cases. The [Postman guide](../docs/qa/postman-guide.md) explains disposable setup and execution. Final totals are 110 unit and 135 PostgreSQL tests, with all backend gates green; negative-path auditing tightened assertions for expectedVersion-specific errors and added invalid-status API coverage without changing product behavior.
