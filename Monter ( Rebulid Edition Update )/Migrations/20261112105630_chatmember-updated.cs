using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Monter___Rebulid_Edition_Update__.Migrations
{
    /// <inheritdoc />
    public partial class chatmemberupdated : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsOwner",
                table: "chatMember",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsOwner",
                table: "chatMember");
        }
    }
}
