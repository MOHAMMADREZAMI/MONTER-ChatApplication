using System.Data.SqlTypes;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Monter___Rebulid_Edition_Update__.Data;
using Monter___Rebulid_Edition_Update__.Services.Auth;

namespace Monter___Rebulid_Edition_Update__.Controllers.AAA_API
{
    [Route("api/auth")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private SignUp ASignUp;
        private Login ALogin;

        public AuthController(SignUp signUp,Login login)
        {
            ASignUp = signUp;
            ALogin = login;
        }


        [HttpPost("signup")]
        public async Task<IActionResult> SignUp(string username , string password,string email)
        {
            if (await ASignUp.isEmailAvailable(email))
                return BadRequest("This email is already using");

            if (await ASignUp.isUsernameAvailable(username))
                return BadRequest("This Username is already using");

            await ASignUp.CreateAccount(new Models.User
            {
                username = username,
                password = password,
                email = email,
                connectionId = string.Empty,
                description = string.Empty,
                Profile = string.Empty,
                status = "Offline"

            });

            return Ok("Account Created");
        }


        [HttpPost("login")]
        public async Task<IActionResult> SignUp(string email, string password)
        {
            if (await ALogin.IsAccountUnavailable(email))
                return BadRequest("Your Email/Password is Worng");

            if (await ALogin.IsPasswordFalse(password))
                return BadRequest("Your Email/Password is Worng");

            return Ok(await ALogin.CreateToken(email));

        }

    }
}
