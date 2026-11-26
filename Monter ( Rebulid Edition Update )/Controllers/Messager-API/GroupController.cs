using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Caching.Hybrid;
using MONTER.Hubs;
using MONTER.Models;
using MONTER.Services.Message;

namespace MONTER.Controllers.Messager_API
{
    [Route("api/group")]
    [ApiController]
    public class GroupController : ControllerBase
    {
        Group Group;
        IHubContext<GroupHub> hub;
        public GroupController(Group _group , IHubContext<GroupHub> context) 
        {
            Group = _group;
            hub = context;
        }

        [Authorize]
        [HttpPost("CreateGroup")]
        public async Task<IActionResult> CreateGroup([FromQuery] string[] members,string GroupName)
        {
            if (members.Length > 9)
                return BadRequest("The maximum number of members in a group is 10.");

            await Group.CreateGroup(members, GroupName, User.FindFirst(ClaimTypes.NameIdentifier).Value);

            await hub.Clients.Users(members).SendAsync("ReceiveCreateGroup", User.FindFirst(ClaimTypes.NameIdentifier).Value, "LoadGroup");

            return Ok();
        }

        [Authorize]
        [HttpPost("LoadGroup")]
        public async Task<List<Chat_Member>> LoadGroup()
        {
            return await Group.LoadGroups(User.FindFirst(ClaimTypes.NameIdentifier).Value);
        }

        [Authorize]
        [HttpPost("GetGroupMembers")]
        public async Task<List<UserSafe>> GetGroupMembers(int chatid)
        {
            return await Group.GetGroupMembers(chatid);
        }

        [Authorize]
        [HttpPost("ChangeGroupProfile")]
        public async Task<IActionResult> ChangeGroupProfile(int chatid , IFormFile Picture)
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
            
            await Group.ChangeGroupPicture(chatid, Picture);

            return Ok();
        }

        [Authorize]
        [HttpPost("DeleteGroup")]
        public async Task<IActionResult> DeleteGroup(int chatid)
        {
            if(!await Group.DeleteGroup(chatid,User.FindFirst(ClaimTypes.NameIdentifier).Value))
            {
                return BadRequest("Owner is not you");
            }

            return Ok();
        }

        [Authorize]
        [HttpPost("AddMember")]
        public async Task<IActionResult> AddMember(int chatid, string target)
        {
            if (!await Group.AddMember(chatid, target, User.FindFirst(ClaimTypes.NameIdentifier).Value))
                return BadRequest("you cannot add a Member");

            await hub.Clients.Users(target).SendAsync("ReceiveAddMember", User.FindFirst(ClaimTypes.NameIdentifier).Value, "LoadGroup");

            return Ok();
        }

        [Authorize]
        [HttpPost("RemoveMember")]
        public async Task<IActionResult> RemoveMember(int chatid, string target)
        {
            if (target == User.FindFirst(ClaimTypes.NameIdentifier).Value)
                return BadRequest("you cannot remove yourself");

            if (!await Group.RemoveMember(chatid, target, User.FindFirst(ClaimTypes.NameIdentifier).Value))
                return BadRequest("you cannot remove a Member");

            await hub.Clients.Users(target).SendAsync("ReceiveRemoveMember", User.FindFirst(ClaimTypes.NameIdentifier).Value, "LoadGroup");

            return Ok();
        }


        [Authorize]
        [HttpPost("LeaveGroup")]
        public async Task<IActionResult> LeaveGroup(int chatid)
        {
            if (!await Group.LeaveGroup(chatid,User.FindFirst(ClaimTypes.NameIdentifier).Value))
                return BadRequest("you are owner , so you cant remove yourself");


            await hub.Clients.Users(User.FindFirst(ClaimTypes.NameIdentifier).Value).SendAsync("ReceiveRemoveMember", "LoadGroup");
            return Ok();
        }


    }
}
