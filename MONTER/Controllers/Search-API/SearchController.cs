using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MONTER.Hubs;
using MONTER.Services.Search;

namespace MONTER.Controllers.Search_API
{
    [Route("api/Search")]
    [ApiController]
    public class SearchController : ControllerBase
    {
        private Search search;
        IHubContext<ProfileHub> hub;
        public SearchController(Search _search, IHubContext<ProfileHub> context)
        {
            search = _search;
            hub = context;
        }


        [Authorize]
        [HttpPost("Search")]
        public async Task<List<string>> SearchUser(string target)
        {
            return await search.search(target);
        }

        [Authorize]
        [HttpPost("AddToChat")]
        public async Task<IActionResult> AddAFriend(string target)
        {
            await search.AddToChat(target, User.FindFirst(ClaimTypes.NameIdentifier)?.Value);
            await hub.Clients.User(target).SendAsync("ReceiveAddFriend", "Refresh");
            return Ok();
        }

        [Authorize]
        [HttpPost("LoadFriends")]
        public async Task <List<string>> LoadFriends()
        {
            return await search.LoadFriends(User.FindFirst(ClaimTypes.NameIdentifier).Value);
        }


    }
}
