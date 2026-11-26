using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MONTER.Data;
using MONTER.Models;
using MONTER.Services.Message;
using MONTER.Services.Search;

namespace MONTER.Hubs
{
    public class ProfileHub : Hub
    {

        private AppDbContext db;
        private Messager messager;
        private Search search;
        public ProfileHub(AppDbContext context, Messager _messager,Search _search)
        {
            db = context;
            messager = _messager;
            search = _search;
        }

        [Authorize]
        public override async Task OnConnectedAsync()
        {
            User user = await db.User.FirstOrDefaultAsync(u => u.username == Context.User.FindFirst(ClaimTypes.NameIdentifier).Value);
            user.connectionId = Context.ConnectionId;
            user.status = "Online";

            await db.SaveChangesAsync();

            string username = Context.User.FindFirst(ClaimTypes.NameIdentifier).Value;
            List<string> friendList = await search.LoadFriends(username);
            await Clients.Users(friendList).SendAsync("ReceiveStatus", username, "Online");

            await base.OnConnectedAsync();
        }

        [Authorize]
        public async Task SaveChanges()
        {
            string username = Context.User.FindFirst(ClaimTypes.NameIdentifier).Value;
            List<string> friendList = await search.LoadFriends(username);

            User user= await db.User.FirstOrDefaultAsync(u => u.username == username);

            UserSafe userSafe = new UserSafe()
            {
                username = user.username,
                description = user.description,
                status = user.status,
                Profile = user.Profile,
            };

            await Clients.Users(friendList).SendAsync("ReceiveStatus", username,userSafe);
        }

        [Authorize]
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            User user = await db.User.FirstOrDefaultAsync(u => u.username == Context.User.FindFirst(ClaimTypes.NameIdentifier).Value);
            user.connectionId = string.Empty;
            user.status = "Offline";

            await db.SaveChangesAsync();

            string username = Context.User.FindFirst(ClaimTypes.NameIdentifier).Value;
            List<string> friendList = await search.LoadFriends(username);
            await Clients.Users(friendList).SendAsync("ReceiveStatus", username, "Offline");

            await base.OnConnectedAsync();

            await base.OnDisconnectedAsync(exception);
        }


    }
}
