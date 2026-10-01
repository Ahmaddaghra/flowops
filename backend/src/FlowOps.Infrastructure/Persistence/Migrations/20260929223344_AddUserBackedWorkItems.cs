using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FlowOps.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBackedWorkItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssigneeUserId",
                table: "WorkItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                table: "WorkItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkItems_AssigneeUserId",
                table: "WorkItems",
                column: "AssigneeUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkItems_CreatedByUserId",
                table: "WorkItems",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ActivityEvents_ActorUserId",
                table: "ActivityEvents",
                column: "ActorUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ActivityEvents_AspNetUsers_ActorUserId",
                table: "ActivityEvents",
                column: "ActorUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkItems_AspNetUsers_AssigneeUserId",
                table: "WorkItems",
                column: "AssigneeUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkItems_AspNetUsers_CreatedByUserId",
                table: "WorkItems",
                column: "CreatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ActivityEvents_AspNetUsers_ActorUserId",
                table: "ActivityEvents");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkItems_AspNetUsers_AssigneeUserId",
                table: "WorkItems");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkItems_AspNetUsers_CreatedByUserId",
                table: "WorkItems");

            migrationBuilder.DropIndex(
                name: "IX_WorkItems_AssigneeUserId",
                table: "WorkItems");

            migrationBuilder.DropIndex(
                name: "IX_WorkItems_CreatedByUserId",
                table: "WorkItems");

            migrationBuilder.DropIndex(
                name: "IX_ActivityEvents_ActorUserId",
                table: "ActivityEvents");

            migrationBuilder.DropColumn(
                name: "AssigneeUserId",
                table: "WorkItems");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "WorkItems");
        }
    }
}
