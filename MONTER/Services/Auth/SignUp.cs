using Microsoft.EntityFrameworkCore;
using MONTER.Data;
using MONTER.Models;

namespace MONTER.Services.Auth
{
    public class SignUp
    {
        private AppDbContext db;

        public SignUp(AppDbContext context)
        {
            db = context;
        }

        
        public async Task<bool> isEmailAvailable(string email)
        {
            bool exists = await db.User.AnyAsync(u => u.email == email);
            return exists;
        }

        public async Task<bool> isUsernameAvailable(string username)
        {
            bool exists = await db.User.AnyAsync(u => u.username == username);
            return exists;
        }

        public async Task CreateAccount(User user)
        {
            await db.User.AddAsync(user);
            await db.SaveChangesAsync();
        }
        


    }
}
