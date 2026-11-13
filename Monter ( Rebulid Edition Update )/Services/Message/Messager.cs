using System.Data;
using System.Runtime.CompilerServices;
using Microsoft.EntityFrameworkCore;
using Microsoft.VisualBasic;
using Monter___Rebulid_Edition_Update__.Data;
using Monter___Rebulid_Edition_Update__.Models;

    
namespace Monter___Rebulid_Edition_Update__.Services.Message
{
    public class Messager
    {
        private AppDbContext db;
        public Messager(AppDbContext context)
        {
            db = context;
        }

        //public async Task<string> GetConnectionId(string Target)
        //{
        //    if (!await db.User.AnyAsync(u => u.username == Target))
        //        return "Error";

        //    User user = await db.User.FirstOrDefaultAsync(u => u.username == Target);

        //    if (user.connectionId == string.Empty)
        //        return "no ConnectionId";

        //    return user.connectionId;
        //}

        public async Task CreateChat(string userone,string usertwo)
        {
            int id = (await db.chatMember.Select(x => (int?)x.chatid).MaxAsync() ?? 0) + 1;

            db.chatMember.Add(new Chat_Member()
            {
                username = userone,
                GroupName = "",
                IsGroup = false,
                IsOwner = false,
                picture = "",
                chatid = id
            });

            await db.SaveChangesAsync();

            db.chatMember.Add(new Chat_Member()
            {
                username = usertwo,
                GroupName = "",
                IsGroup = false,
                IsOwner = false,
                picture = "",
                chatid = id
            });

            await db.SaveChangesAsync();
        }

        public async Task<int> GetChat(string currentUsername ,string targetUsername)
        {
            var currentChats = await db.chatMember
                .Where(x => x.username == currentUsername)
                .Select(x => x.chatid).
                ToListAsync();

            var targetChats = await db.chatMember
                .Where(x => x.username == targetUsername)
                .Select(x => x.chatid)
                .ToListAsync();

            int chatId = currentChats
                .Intersect(targetChats)
                .FirstOrDefault();

            return chatId;
        }

        public async Task SaveMessage(Models.Message message)
        {
            db.Messages.Add(message);
            db.SaveChanges();
        }

        public async Task<List<Models.Message>> loadMessage(int chatid)
        {
            return await db.Messages.Where(mess => mess.chatid.Equals(chatid)).Select(mess => mess).ToListAsync();
        }

        public async Task DeleteMessage(int MessageId)
        {
            Models.Message message = await db.Messages.FirstOrDefaultAsync(mess => mess.Id.Equals(MessageId));
            db.Messages.Remove(message);
            await db.SaveChangesAsync();
        }

    }
}
