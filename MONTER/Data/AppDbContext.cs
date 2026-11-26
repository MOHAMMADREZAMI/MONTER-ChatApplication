using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Internal;
using MONTER.Migrations;
using MONTER.Models;

namespace MONTER.Data
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
