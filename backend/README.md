# FlowOps Backend

The backend is a .NET 10 Web API organized into Domain, Application, Infrastructure, and API projects. PostgreSQL is accessed through EF Core; the Application project depends on Domain and does not reference EF Core.

## Run locally

From the repository root, start PostgreSQL using the root setup instructions, then run:

```bash
dotnet ef database update \
  --project backend/src/FlowOps.Infrastructure/FlowOps.Infrastructure.csproj \
  --startup-project backend/src/FlowOps.Api/FlowOps.Api.csproj

ASPNETCORE_ENVIRONMENT=Development \
dotnet run \
  --project backend/src/FlowOps.Api/FlowOps.Api.csproj \
  --no-launch-profile \
  --urls http://localhost:5055
```

The Development connection string is local-only. For another database, supply `ConnectionStrings__DefaultConnection` through the environment instead of committing credentials. Swagger UI is served at `/swagger` in Development.

## Verify

```bash
dotnet format backend/FlowOps.sln --verify-no-changes --no-restore
dotnet build backend/FlowOps.sln --no-restore
dotnet test backend/tests/FlowOps.UnitTests/FlowOps.UnitTests.csproj --no-build
```

The API integration tests require a dedicated PostgreSQL database. They create a unique schema, run migrations and HTTP tests within it, and drop that schema afterward:

```bash
FLOWOPS_TEST_CONNECTION='Host=localhost;Port=5432;Database=flowops_integration;Username=flowops_test;Password=flowops_test' \
dotnet test backend/tests/FlowOps.IntegrationTests/FlowOps.IntegrationTests.csproj
```

Use a disposable test database; the integration fixture creates and drops schemas in the configured database. GitHub Actions provisions PostgreSQL 17 for this job.

## API

The implemented contract is documented in [API Design](../docs/API_DESIGN.md). A ready-to-import Postman collection and local environment are in `docs/postman/`.
