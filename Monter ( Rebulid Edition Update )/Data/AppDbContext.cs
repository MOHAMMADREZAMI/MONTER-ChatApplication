using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Internal;
using Monter___Rebulid_Edition_Update__.Migrations;
using Monter___Rebulid_Edition_Update__.Models;

namespace Monter___Rebulid_Edition_Update__.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {

        }

        public DbSet<User> User { get; set; }
        public DbSet<Friend> Friend { get; set; }
        public DbSet<Models.Chat_Member> chatMember { get; set; }
        public DbSet<Models.Message> Messages { get; set; }
    }
}
