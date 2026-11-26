using System.Drawing;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MONTER.Data;
using MONTER.Models;

namespace MONTER.Services.Auth
{
    public class Login
    {
        private AppDbContext db;
        private HashingService hasher;
        public Login(AppDbContext Context , HashingService hash)
        {
            db = Context;
            hasher = hash;
        }

        public async Task<bool> IsAccountUnavailable(string email)
        {
            bool exists = !await db.User.AnyAsync(e => e.email == email);
            return exists;
        }

        public async Task<bool> IsPasswordFalse(string email , string password)
        {
            User user = await db.User.FirstOrDefaultAsync(x => x.email == email);

            return !hasher.Verify(password, user.password);


        }

        public async Task<string> CreateToken(string email)
        {
            User user = await db.User.FirstOrDefaultAsync(x => x.email == email);

            Claim[] claims = new Claim[] { new Claim(ClaimTypes.NameIdentifier,user.username) };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Environment.GetEnvironmentVariable("MONTER_KEY")));
            var credentials = new SigningCredentials( key, SecurityAlgorithms.HmacSha256 );

            Console.WriteLine(Environment.GetEnvironmentVariable("MONTER_KEY"));

            var token = new JwtSecurityToken(
                issuer: "Monter",
                audience: "MonterClient"
                ,claims: claims,
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);

            
        }

    }
}
