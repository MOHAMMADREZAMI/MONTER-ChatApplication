using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Monter___Rebulid_Edition_Update__.Hubs;
using Monter___Rebulid_Edition_Update__.Models;
using Monter___Rebulid_Edition_Update__.Services.MyProfile;

namespace Monter___Rebulid_Edition_Update__.Controllers.Profile
{
    [Route("api/profile")]
    [ApiController]
    public class ProfileController : ControllerBase
    {
        private MyProfile MyProfile;

        public ProfileController(MyProfile _profile)
        {
            MyProfile = _profile;
        }

        [Authorize]
        [HttpPost("getFriendsStatus")]
        public async Task<List<UserSafe>> GetFriendStatus()
        {
            return await MyProfile.GetFriendsStatus(User.FindFirst(ClaimTypes.NameIdentifier).Value);
        }

        [Authorize]
        [HttpPost("ChangeProfile")]
        public async Task<IActionResult> ChangeProfile(IFormFile Picture)
        {
            string extension = Path.GetExtension(Picture.FileName).ToLower();

            string[] ImageTypes =
            {
                ".jpg",".jpeg",".png",".webp"
            };

            if (!ImageTypes.Contains(extension))
                return BadRequest("Only image files are allowed.");

            if (Picture.Length > 5 * 1024 * 1024)
                return BadRequest("Maximum image size is 5MB.");

            await MyProfile.ChangeProfile(User.FindFirst(ClaimTypes.NameIdentifier).Value, Picture);

            return Ok();
        }

        [Authorize]
        [HttpPost("ChangeDescription")]
        public async Task<IActionResult> ChangeDescription(string Description)
        {
            await MyProfile.ChangeDecription(User.FindFirst(ClaimTypes.NameIdentifier).Value, Description);
            return Ok();
        }

        [Authorize]
        [HttpPost("GetProfile")]
        public async Task<UserSafe> GetProfile(string target = "")
        {
            if (target is "")
                return await MyProfile.GetProfile(User.FindFirst(ClaimTypes.NameIdentifier).Value);

            return await MyProfile.GetProfile(target);
                
        }

    }
}
