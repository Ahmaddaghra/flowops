using FlowOps.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
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
    private string? _previousConnectionString;

    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        _adminConnectionString = Environment.GetEnvironmentVariable("FLOWOPS_TEST_CONNECTION")
            ?? throw new InvalidOperationException("Set FLOWOPS_TEST_CONNECTION to a dedicated PostgreSQL test database.");
        _previousConnectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
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
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", _testConnectionString);

        Client = CreateClient();
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>().Database.MigrateAsync();
    }

    public async Task ResetDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        await dbContext.ActivityEvents.ExecuteDeleteAsync();
        await dbContext.WorkItems.ExecuteDeleteAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
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
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", _previousConnectionString);

        if (_adminConnectionString.Length == 0 || _schemaName.Length == 0) return;
        await using var connection = new NpgsqlConnection(_adminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"DROP SCHEMA IF EXISTS \"{_schemaName}\" CASCADE";
        await command.ExecuteNonQueryAsync();
    }
}
