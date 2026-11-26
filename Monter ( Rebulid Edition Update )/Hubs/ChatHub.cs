using System.ComponentModel;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MONTER.Data;
using MONTER.Models;
using MONTER.Services.Message;
using static Microsoft.EntityFrameworkCore.DbLoggerCategory.Database;

namespace MONTER.Hubs
{
    public class ChatHub : Hub
    {
        private AppDbContext db;
        private Messager messager;
        public ChatHub (AppDbContext context, Messager _messager)
        {
            db = context;
            messager = _messager;
        }

        [Authorize]
        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
        }

        [Authorize]
        public async Task<int> joinChat(string targetUsername = "" , int Groupchatid = 0)
        {
            int chatid = 0;
            if (targetUsername != "")
            {
                chatid = await messager.GetChat(Context.User.FindFirst(ClaimTypes.NameIdentifier).Value, targetUsername);
                await Groups.AddToGroupAsync(Context.ConnectionId, chatid +"room");
                return chatid;
            }
            else
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, Groupchatid + "room");
                return 0;
            }            
        }

        [Authorize]
        public async Task SendMessage(string content,int chatid,string target = "" ,string fileName = null,byte[] File = null)
        {
            string filePath = "";

            if (File != null && File.Length > 0)
            {
                string folder = Path.Combine(
                    "wwwroot", "Uploads", "File");

                Directory.CreateDirectory(folder);

                string newFileName = Guid.NewGuid().ToString()
                                   + Path.GetExtension(fileName);

                string path = Path.Combine(folder, newFileName);

                await System.IO.File.WriteAllBytesAsync(path, File);

                filePath = "Uploads/File/" + newFileName;
            }

            Models.Message message = new Models.Message()
            {
                chatid = chatid,
                Content = content,
                Sender = Context.User.FindFirst(ClaimTypes.NameIdentifier).Value,
                Receiver = target,
                SentAt = DateTime.UtcNow,
                File = filePath
            };

            await messager.SaveMessage(message);

            await Clients.Group(chatid + "room")
                .SendAsync("ReceiveMessage", message);
        }

        [Authorize]
        public async Task LeaveChat(int chatid)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, chatid + "room");
        }

        [Authorize]
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            User user = await db.User.FirstOrDefaultAsync(u => u.username == Context.User.FindFirst(ClaimTypes.NameIdentifier).Value);
            user.connectionId = string.Empty;
            user.status = "Offline";

            await db.SaveChangesAsync();

            await base.OnDisconnectedAsync(exception);
        }

    }
}
