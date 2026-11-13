using System.Drawing;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Monter___Rebulid_Edition_Update__.Data;
using Monter___Rebulid_Edition_Update__.Models;

namespace Monter___Rebulid_Edition_Update__.Services.Auth
{
    public class Login
    {
        private AppDbContext db;

        public Login(AppDbContext Context)
        {
            db = Context;
        }

        public async Task<bool> IsAccountUnavailable(string email)
        {
            bool exists = !await db.User.AnyAsync(e => e.email == email);
            return exists;
        }

        public async Task<bool> IsPasswordFalse(string password)
        {
            bool exists = !await db.User.AnyAsync(p => p.password == password);
            return exists;
        }

        public async Task<string> CreateToken(string email)
        {
            User user = await db.User.FirstOrDefaultAsync(x => x.email == email);

            Claim[] claims = new Claim[] { new Claim(ClaimTypes.NameIdentifier,user.username) };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("SD123nsdpppaakdo1kd;1kso2kflapsdk"));
            var credentials = new SigningCredentials( key, SecurityAlgorithms.HmacSha256 );

            var token = new JwtSecurityToken(
                issuer: "Monter",
                audience: "MonterClient"
                ,claims: claims,
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);

            
        }

    }
}
