using FlowOps.Application.Authorization;
using FlowOps.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace FlowOps.IntegrationTests;

public class MigrationCollaborationTests : IClassFixture<FlowOpsApiFactory>
{
    private readonly FlowOpsApiFactory _factory;

    public MigrationCollaborationTests(FlowOpsApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Phase3ToLatest_DownAndUp_PreserveLegacyItemsActivityAndRoleDefinitions()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var migrator = db.GetService<IMigrator>();
        const string phase3Migration = "20260929163759_AddWorkItemConcurrency";
        var itemId = Guid.NewGuid();
        var activityId = Guid.NewGuid();
        var timestamp = new DateTime(2026, 9, 29, 12, 0, 0, DateTimeKind.Utc);

        await migrator.MigrateAsync(phase3Migration);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "WorkItems" ("Id", "Title", "Description", "Status", "Priority", "AssigneeName", "CreatedAtUtc", "UpdatedAtUtc", "Version")
            VALUES ({itemId}, {"Legacy Phase 3 item"}, {"Preserve before authentication"}, {"Todo"}, {"High"}, {"Legacy matching user"}, {timestamp}, {timestamp}, {7L})
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "ActivityEvents" ("Id", "WorkItemId", "EventType", "Description", "CreatedAtUtc", "ActorUserId")
            VALUES ({activityId}, {itemId}, {"Created"}, {"Historical Phase 3 creation"}, {timestamp}, {null as Guid?})
            """);

        await migrator.MigrateAsync();
        await AssertPreservedAsync(db, itemId, activityId, timestamp);
        Assert.Equal(new[] { AppRoles.Admin, AppRoles.Member }, await db.Roles.OrderBy(role => role.Name).Select(role => role.Name).ToArrayAsync());
        Assert.Equal(4, await db.Categories.CountAsync());

        // A same-name Identity user must never turn historical free text into ownership.
        await _factory.SeedUserAsync(displayName: "Legacy matching user");
        var unrelatedUser = await db.Users.AsNoTracking().SingleAsync(user => user.DisplayName == "Legacy matching user");
        var legacy = await db.WorkItems.AsNoTracking().SingleAsync(item => item.Id == itemId);
        Assert.Null(legacy.CreatedByUserId);
        Assert.Null(legacy.AssigneeUserId);
        Assert.NotEqual(Guid.Empty, unrelatedUser.Id);

        await migrator.MigrateAsync(phase3Migration);
        await db.Database.OpenConnectionAsync();
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = """
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'WorkItems'
                AND column_name IN ('CreatedByUserId', 'AssigneeUserId')
                """;
            Assert.Equal(0L, (long)(await command.ExecuteScalarAsync())!);
            command.CommandText = "SELECT count(*) FROM \"WorkItems\" WHERE \"Title\" = 'Legacy Phase 3 item' AND \"AssigneeName\" = 'Legacy matching user' AND \"Version\" = 7";
            Assert.Equal(1L, (long)(await command.ExecuteScalarAsync())!);
            command.CommandText = "SELECT count(*) FROM \"ActivityEvents\" WHERE \"Description\" = 'Historical Phase 3 creation' AND \"ActorUserId\" IS NULL";
            Assert.Equal(1L, (long)(await command.ExecuteScalarAsync())!);
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }

        await migrator.MigrateAsync();
        await AssertPreservedAsync(db, itemId, activityId, timestamp);
        Assert.Equal(new[] { AppRoles.Admin, AppRoles.Member }, await db.Roles.OrderBy(role => role.Name).Select(role => role.Name).ToArrayAsync());
    }

    private static async Task AssertPreservedAsync(FlowOpsDbContext db, Guid itemId, Guid activityId, DateTime timestamp)
    {
        var legacy = await db.WorkItems.AsNoTracking().SingleAsync(item => item.Id == itemId);
        Assert.Equal("Legacy Phase 3 item", legacy.Title);
        Assert.Equal("Preserve before authentication", legacy.Description);
        Assert.Equal("Legacy matching user", legacy.AssigneeName);
        Assert.Null(legacy.CreatedByUserId);
        Assert.Null(legacy.AssigneeUserId);
        Assert.Equal(7, legacy.Version);
        Assert.Equal(timestamp, legacy.CreatedAtUtc);
        Assert.Equal(timestamp, legacy.UpdatedAtUtc);
        var history = await db.ActivityEvents.AsNoTracking().SingleAsync(activity => activity.Id == activityId);
        Assert.Equal(itemId, history.WorkItemId);
        Assert.Equal("Historical Phase 3 creation", history.Description);
        Assert.Equal(timestamp, history.CreatedAtUtc);
        Assert.Null(history.ActorUserId);
    }
}
