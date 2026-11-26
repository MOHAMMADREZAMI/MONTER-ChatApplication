using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Client;
using MONTER.Data;
using MONTER.Models;
using MONTER.Services.Message;
using MONTER.Services.Search;

namespace MONTER.Hubs
{
    public class GroupHub : Hub
    {
        private AppDbContext db;
        private Messager messager;
        private Search search;
        public GroupHub(AppDbContext context, Messager _messager, Search _search)
        {
            db = context;
            messager = _messager;
            search = _search;
        }

        

        [Authorize]
        public async Task ChangeProfile(string[] members , int chatid)
        {
            Chat_Member chat = await db.chatMember.FirstOrDefaultAsync(x => x.chatid.Equals(chatid));
            await Clients.Users(members).SendAsync("ReceiveProfile", Context.User.FindFirst(ClaimTypes.NameIdentifier).Value, chat.picture,chatid);
        }

        [Authorize]
        public async Task DeleteGroup(string[] members, int chatid)
        {
            Chat_Member chat = await db.chatMember.FirstOrDefaultAsync(x => x.chatid.Equals(chatid));
            await Clients.Users(members).SendAsync("ReceiveDeleteGroup", Context.User.FindFirst(ClaimTypes.NameIdentifier).Value,"Group Deleted", chatid);
        }

    }
}
