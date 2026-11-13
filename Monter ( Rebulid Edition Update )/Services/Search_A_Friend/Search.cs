using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Client;
using Monter___Rebulid_Edition_Update__.Data;
using Monter___Rebulid_Edition_Update__.Models;
using Monter___Rebulid_Edition_Update__.Services.Message;

namespace Monter___Rebulid_Edition_Update__.Services.Search
{
    public class Search
    {
        private AppDbContext db;
        private Messager messager;

        public Search(AppDbContext context , Messager _messager)
        {
            db = context;
            messager = _messager;
        }


        public async Task<List<string>> search(string Target)
        {
           return await db.User.Where(u => u.username.Contains(Target)).Select(u => u.username).Take(20).ToListAsync();
        }

        public async Task AddToChat(string target , string account)
        {
            if (!await db.User.AnyAsync(u => u.username == target))
                return;

            if (await db.Friend.AnyAsync(u => u.UserOne == account && u.UserTwo == target))
                return;
            
            await db.Friend.AddAsync(new Friend()
            {
                UserOne = account,
                UserTwo = target
            });
            
            await db.SaveChangesAsync();

            await db.Friend.AddAsync(new Friend()
            {
                UserOne = target,
                UserTwo = account
            });

            await db.SaveChangesAsync();

            await messager.CreateChat(account, target);

        }

        public async Task<List<string>> LoadFriends(string account)
        {
            return await db.Friend.Where(u => u.UserOne.Equals(account)).Select(u => u.UserTwo).ToListAsync();
        }
    }
}
