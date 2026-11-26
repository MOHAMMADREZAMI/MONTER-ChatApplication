using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MONTER.Migrations
{
    /// <inheritdoc />
    public partial class AddProfileImageToUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Profile",
                table: "User",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "connectionId",
                table: "User",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Profile",
                table: "User");

            migrationBuilder.DropColumn(
                name: "connectionId",
                table: "User");
        }
    }
}
