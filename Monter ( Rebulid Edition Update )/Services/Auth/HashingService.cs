using System.Reflection.Metadata.Ecma335;
using Microsoft.AspNetCore.Identity;

namespace MONTER.Services.Auth
{
    public class HashingService
    {
        private PasswordHasher<object> hasher;
        public HashingService(PasswordHasher<object> _hash)
        {
            hasher = _hash;
        }

        public string HashingPassword(string password)
        {
            return hasher.HashPassword(null!,password);
        }

        public bool Verify(string password , string HashedPassword)
        {
           return hasher.VerifyHashedPassword(null!, HashedPassword, password) == PasswordVerificationResult.Success ? true : false;
        }

    }
}
