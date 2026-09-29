using System.Net.Http.Headers;
using System.Net.Http.Json;
using FlowOps.Application.Authorization;
using FlowOps.Application.DTOs;
using FlowOps.Infrastructure.Identity;
using FlowOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Xunit;

namespace FlowOps.IntegrationTests;

public sealed class FlowOpsApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private string _adminConnectionString = string.Empty;
    private string _testConnectionString = string.Empty;
    private string _schemaName = string.Empty;

    // Deliberately public and fake: used only by this test host and invalid-token tests.
    public const string TestSigningKey = "FAKE-INTEGRATION-TEST-KEY-DO-NOT-USE-IN-APPLICATION-1234567890";
    public const string TestIssuer = "flowops-integration-tests";
    public const string TestAudience = "flowops-integration-test-client";
    public const string TestPassword = "TestPass123";

    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        _adminConnectionString = Environment.GetEnvironmentVariable("FLOWOPS_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set FLOWOPS_TEST_CONNECTION to a dedicated PostgreSQL test database.");
        _schemaName = $"flowops_it_{Guid.NewGuid():N}";

        await using (var connection = new NpgsqlConnection(_adminConnectionString))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = $"CREATE SCHEMA \"{_schemaName}\"";
            await command.ExecuteNonQueryAsync();
        }

        var connectionStringBuilder = new NpgsqlConnectionStringBuilder(_adminConnectionString)
        {
            SearchPath = _schemaName
        };
        _testConnectionString = connectionStringBuilder.ConnectionString;

        // Startup role/bootstrap services may query Identity, so the isolated schema must
        // exist before the application host starts. No process-global settings are changed.
        await using (var dbContext = new FlowOpsDbContext(new DbContextOptionsBuilder<FlowOpsDbContext>()
            .UseNpgsql(_testConnectionString).Options))
        {
            await dbContext.Database.MigrateAsync();
        }

        Client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        await EnsureRolesAsync();
    }

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        await dbContext.ActivityEvents.ExecuteDeleteAsync();
        await dbContext.WorkItems.ExecuteDeleteAsync();
    }

    public async Task EnsureRolesAsync()
    {
        using var scope = Services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var roleName in new[] { AppRoles.Admin, AppRoles.Member })
        {
            if (await roles.RoleExistsAsync(roleName)) continue;
            var result = await roles.CreateAsync(new IdentityRole<Guid>(roleName) { Id = Guid.NewGuid() });
            Assert.True(result.Succeeded, string.Join("; ", result.Errors.Select(error => error.Description)));
        }
    }

    public async Task<ApplicationUser> SeedUserAsync(string role = AppRoles.Member, string? email = null,
        string displayName = "Integration user", bool isActive = true)
    {
        await EnsureRolesAsync();
        using var scope = Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email ?? $"test-{Guid.NewGuid():N}@example.test",
            Email = email,
            DisplayName = displayName,
            IsActive = isActive,
            LockoutEnabled = true
        };
        user.Email ??= user.UserName;
        var created = await users.CreateAsync(user, TestPassword);
        Assert.True(created.Succeeded, string.Join("; ", created.Errors.Select(error => error.Description)));
        var assigned = await users.AddToRoleAsync(user, role);
        Assert.True(assigned.Succeeded, string.Join("; ", assigned.Errors.Select(error => error.Description)));
        return user;
    }

    public async Task<HttpClient> CreateAuthenticatedClientAsync(string role = AppRoles.Member,
        string? email = null, string displayName = "Integration user")
    {
        var user = await SeedUserAsync(role, email, displayName);
        return await CreateAuthenticatedClientAsync(user);
    }

    public async Task<HttpClient> CreateAuthenticatedClientAsync(ApplicationUser user)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        using var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = user.Email, password = TestPassword });
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", _testConnectionString);
        builder.UseSetting("Jwt:Issuer", TestIssuer);
        builder.UseSetting("Jwt:Audience", TestAudience);
        builder.UseSetting("Jwt:AccessTokenMinutes", "60");
        builder.UseSetting("Jwt:SigningKey", TestSigningKey);
        builder.UseSetting("FLOWOPS_JWT_SIGNING_KEY", string.Empty);
        builder.UseSetting("FLOWOPS_SEED_ADMIN_EMAIL", string.Empty);
        builder.UseSetting("FLOWOPS_SEED_ADMIN_PASSWORD", string.Empty);
        builder.UseSetting("FLOWOPS_SEED_ADMIN_DISPLAY_NAME", string.Empty);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<FlowOpsDbContext>>();
            services.AddDbContext<FlowOpsDbContext>(options => options.UseNpgsql(_testConnectionString));
        });
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();

        if (_adminConnectionString.Length == 0 || _schemaName.Length == 0) return;
        await using var connection = new NpgsqlConnection(_adminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"DROP SCHEMA IF EXISTS \"{_schemaName}\" CASCADE";
        await command.ExecuteNonQueryAsync();
    }
}
