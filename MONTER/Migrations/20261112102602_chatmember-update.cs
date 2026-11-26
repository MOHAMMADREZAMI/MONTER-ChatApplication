using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MONTER.Migrations
{
    /// <inheritdoc />
    public partial class chatmemberupdate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GroupName",
                table: "chatMember",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsGroup",
                table: "chatMember",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "picture",
                table: "chatMember",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GroupName",
                table: "chatMember");

            migrationBuilder.DropColumn(
                name: "IsGroup",
                table: "chatMember");

            migrationBuilder.DropColumn(
                name: "picture",
                table: "chatMember");
        }
    }
}
