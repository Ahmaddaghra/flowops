using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace FlowOps.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkItemLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId",
                table: "WorkItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ActivityEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivityEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActivityEvents_WorkItems_WorkItemId",
                        column: x => x.WorkItemId,
                        principalTable: "WorkItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NameKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "Categories",
                columns: new[] { "Id", "CreatedAtUtc", "IsActive", "Name", "NameKey" },
                values: new object[,]
                {
                    { new Guid("10000000-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, "Operations", "OPERATIONS" },
                    { new Guid("10000000-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, "Support", "SUPPORT" },
                    { new Guid("10000000-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, "Engineering", "ENGINEERING" },
                    { new Guid("10000000-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, "Billing", "BILLING" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkItems_AssigneeName",
                table: "WorkItems",
                column: "AssigneeName");

            migrationBuilder.CreateIndex(
                name: "IX_WorkItems_CategoryId",
                table: "WorkItems",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkItems_Priority",
                table: "WorkItems",
                column: "Priority");

            migrationBuilder.CreateIndex(
                name: "IX_ActivityEvents_WorkItemId_CreatedAtUtc",
                table: "ActivityEvents",
                columns: new[] { "WorkItemId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Categories_NameKey",
                table: "Categories",
                column: "NameKey",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkItems_Categories_CategoryId",
                table: "WorkItems",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WorkItems_Categories_CategoryId",
                table: "WorkItems");

            migrationBuilder.DropTable(
                name: "ActivityEvents");

            migrationBuilder.DropTable(
                name: "Categories");

            migrationBuilder.DropIndex(
                name: "IX_WorkItems_AssigneeName",
                table: "WorkItems");

            migrationBuilder.DropIndex(
                name: "IX_WorkItems_CategoryId",
                table: "WorkItems");

            migrationBuilder.DropIndex(
                name: "IX_WorkItems_Priority",
                table: "WorkItems");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "WorkItems");
        }
    }
}
