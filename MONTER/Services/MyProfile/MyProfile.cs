using System.IO;
using Microsoft.EntityFrameworkCore;
using MONTER.Data;
using MONTER.Models;
using MONTER.Services.Search;

namespace MONTER.Services.MyProfile
{
    public class MyProfile
    {
        private AppDbContext db;
        Search.Search search;
        public MyProfile(AppDbContext context,Search.Search _search)
        {
            db = context;
            search = _search;
        }

        public async Task<List<UserSafe>> GetFriendsStatus(string Account)
        {
            List<string> friends = await search.LoadFriends(Account);

            List<UserSafe> friendsStatus = await db.User
                .Where(u => friends.Contains(u.username))
                .Select(u => new UserSafe
                {
                    username = u.username,
                    Profile = u.Profile,
                    status = u.status
                })
                .ToListAsync();

            return friendsStatus;
        }

        public async Task ChangeDecription(string username ,string description)
        {
            User user = await db.User.FirstOrDefaultAsync(u => u.username == username);
            user.description = description;
            await db.SaveChangesAsync();
        }

        public async Task ChangeProfile(string username , IFormFile Picture)
        {
            string path = Path.Combine("wwwroot", "Uploads", "Profile",Picture.FileName);
            using var stream = new FileStream(path, FileMode.Create);
            await Picture.CopyToAsync(stream);

            User user = await db.User.FirstOrDefaultAsync(u => u.username == username);
            user.Profile = "Uploads/Profile/" + Picture.FileName;

            await db.SaveChangesAsync();
        }

        public async Task<UserSafe> GetProfile(string Target)
        {
            User user = await db.User.FirstOrDefaultAsync(u => u.username == Target);

            return new UserSafe()
            {
                username = user.username,
                Profile = user.Profile,
                description = user.description,
                status = user.status
            };
        }

    }
}
