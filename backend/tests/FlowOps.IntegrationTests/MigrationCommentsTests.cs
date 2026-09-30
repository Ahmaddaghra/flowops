using FlowOps.Application.Authorization;
using FlowOps.Domain.Entities;
using FlowOps.Domain.Enums;
using FlowOps.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace FlowOps.IntegrationTests;

public class MigrationCommentsTests(FlowOpsApiFactory factory) : IClassFixture<FlowOpsApiFactory>
{
    [Fact]
    public async Task Stage4DToComments_DownAndUp_PreservesItemsVersionsActivityUsersRolesAndAssignments()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FlowOpsDbContext>();
        var migrator = db.GetService<IMigrator>();
        const string stage4dMigration = "20260929223344_AddUserBackedWorkItems";
        await migrator.MigrateAsync(stage4dMigration);
        var creator = await factory.SeedUserAsync(displayName: "Preserved creator");
        var assignee = await factory.SeedUserAsync(AppRoles.Admin, displayName: "Preserved assignee");
        var timestamp = new DateTime(2026, 9, 30, 10, 0, 0, DateTimeKind.Utc);
        var item = new WorkItem("Preserved Stage 4D item", "Original details", WorkItemPriority.High,
            "Historical assignment", categoryId: Guid.Parse("10000000-0000-0000-0000-000000000001"),
            createdAtUtc: timestamp, createdByUserId: creator.Id, assigneeUserId: assignee.Id);
        item.ChangeTitle("Preserved edited Stage 4D item");
        var activity = new ActivityEvent(item.Id, ActivityEventType.AssignmentChanged,
            "Existing assignment history", timestamp, assignee.Id);
        db.WorkItems.Add(item);
        db.ActivityEvents.Add(activity);
        await db.SaveChangesAsync();
        var itemBefore = await ItemSnapshotAsync(db, item.Id);
        var activityBefore = await ActivitySnapshotAsync(db, activity.Id);
        var usersBefore = await UserSnapshotsAsync(db);
        var rolesBefore = await RoleSnapshotsAsync(db);
        var membershipsBefore = await db.UserRoles.AsNoTracking().OrderBy(row => row.UserId).ThenBy(row => row.RoleId).ToArrayAsync();
        var memberships = membershipsBefore.Select(row => (row.UserId, row.RoleId)).ToArray();
        var categoriesBefore = await db.Categories.AsNoTracking().OrderBy(row => row.Id).Select(row => new { row.Id, row.Name, row.NameKey, row.IsActive, row.CreatedAtUtc }).ToArrayAsync();

        await migrator.MigrateAsync();
        var migrations = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
        Assert.EndsWith("_AddWorkItemComments", migrations[^1]);
        Assert.Equal(6, migrations.Length);
        await AssertPreservedAsync();
        Assert.Empty(await db.Comments.AsNoTracking().ToListAsync());
        var comment = new Comment(item.Id, creator.Id, "New Stage 4E data", timestamp);
        db.Comments.Add(comment);
        await db.SaveChangesAsync();
        Assert.Single(await db.Comments.AsNoTracking().ToListAsync());

        await migrator.MigrateAsync(stage4dMigration);
        await AssertPreservedAsync();
        await db.Database.OpenConnectionAsync();
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'Comments'";
            Assert.Equal(0L, (long)(await command.ExecuteScalarAsync())!);
        }
        finally { await db.Database.CloseConnectionAsync(); }

        await migrator.MigrateAsync();
        await AssertPreservedAsync();
        // Down intentionally drops Stage 4E comment data, while all Stage 4D data survives.
        Assert.Empty(await db.Comments.AsNoTracking().ToListAsync());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());

        async Task AssertPreservedAsync()
        {
            Assert.Equal(itemBefore, await ItemSnapshotAsync(db, item.Id));
            Assert.Equal(activityBefore, await ActivitySnapshotAsync(db, activity.Id));
            Assert.Equal(usersBefore, await UserSnapshotsAsync(db));
            Assert.Equal(rolesBefore, await RoleSnapshotsAsync(db));
            var currentMemberships = await db.UserRoles.AsNoTracking().OrderBy(row => row.UserId).ThenBy(row => row.RoleId).ToArrayAsync();
            Assert.Equal(memberships, currentMemberships.Select(row => (row.UserId, row.RoleId)).ToArray());
            var currentCategories = await db.Categories.AsNoTracking().OrderBy(row => row.Id).Select(row => new { row.Id, row.Name, row.NameKey, row.IsActive, row.CreatedAtUtc }).ToArrayAsync();
            Assert.Equal(categoriesBefore, currentCategories);
        }
    }

    private static async Task<object> ItemSnapshotAsync(FlowOpsDbContext db, Guid id) =>
        await db.WorkItems.AsNoTracking().Where(row => row.Id == id)
            .Select(row => new { row.Id, row.Version, row.Title, row.Description, row.Status, row.Priority, row.CategoryId, row.AssigneeName, row.CreatedByUserId, row.AssigneeUserId, row.CreatedAtUtc, row.UpdatedAtUtc }).SingleAsync();

    private static async Task<object> ActivitySnapshotAsync(FlowOpsDbContext db, Guid id) =>
        await db.ActivityEvents.AsNoTracking().Where(row => row.Id == id)
            .Select(row => new { row.Id, row.WorkItemId, row.EventType, row.Description, row.ActorUserId, row.CreatedAtUtc }).SingleAsync();

    private static async Task<object[]> UserSnapshotsAsync(FlowOpsDbContext db) =>
        await db.Users.AsNoTracking().OrderBy(row => row.Id)
            .Select(row => (object)new { row.Id, row.UserName, row.NormalizedUserName, row.Email, row.NormalizedEmail, row.EmailConfirmed, row.PasswordHash, row.SecurityStamp, row.ConcurrencyStamp, row.DisplayName, row.IsActive, row.PhoneNumber, row.PhoneNumberConfirmed, row.TwoFactorEnabled, row.LockoutEnd, row.LockoutEnabled, row.AccessFailedCount }).ToArrayAsync();

    private static async Task<object[]> RoleSnapshotsAsync(FlowOpsDbContext db) =>
        await db.Roles.AsNoTracking().OrderBy(row => row.Id)
            .Select(row => (object)new { row.Id, row.Name, row.NormalizedName, row.ConcurrencyStamp }).ToArrayAsync();
}
