using System.ComponentModel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Client;
using Monter___Rebulid_Edition_Update__.Data;
using Monter___Rebulid_Edition_Update__.Models;

namespace Monter___Rebulid_Edition_Update__.Services.Message
{
    public class Group
    {

        private AppDbContext db;
        public Group(AppDbContext context)
        {
            db = context;
        }

        public async Task CreateGroup(string[] members,string GroupName,string Account)
        {
            List<Chat_Member> chat_Members = new List<Chat_Member>();
            int id = (await db.chatMember.Select(x => (int?)x.chatid).MaxAsync() ?? 0) + 1;

            for (int i = 0; i < members.Length; i++)
                chat_Members.Add(new Chat_Member
                {
                    username = members[i],
                    GroupName = GroupName,
                    IsGroup = true,
                    chatid = id,
                    IsOwner = false,
                    picture = ""

                });

            chat_Members.Add(new Chat_Member
            {
                username = Account,
                GroupName = GroupName,
                chatid = id,
                IsGroup = true,
                IsOwner = true,
                picture = ""
            });

            await db.chatMember.AddRangeAsync(chat_Members);
            await db.SaveChangesAsync();


        }

        public async Task<List<Chat_Member>> LoadGroups(string Account)
        {
            return await db.chatMember.Where(u => u.IsGroup.Equals(true) && u.username.Equals(Account)).Select(u => u).ToListAsync();
        }

        public async Task<List<UserSafe>> GetGroupMembers(int chatid)
        {
            List<string> list = await db.chatMember.Where(u => u.chatid.Equals(chatid)).Select(u => u.username).ToListAsync ();
            List<UserSafe> usersafe = new List<UserSafe>();

            for (int i = 0; i < list.Count; i++)
            {
                User user = await db.User.FirstOrDefaultAsync(u => u.username.Equals(list[i]));
                usersafe.Add(new UserSafe
                {
                    username = user.username,
                    Profile = user.Profile,
                    status = user.status,
                });
            }

            return usersafe;
        }

        public async Task ChangeGroupPicture(int chatid,IFormFile Picture)
        {
            string path = Path.Combine("wwwroot", "Uploads", "GroupProfile", Picture.FileName);
            using var stream = new FileStream(path, FileMode.Create);
            await Picture.CopyToAsync(stream);

            List<Chat_Member> userList = await db.chatMember.Where(x => x.chatid.Equals(chatid)).ToListAsync();
            foreach(Chat_Member x in userList)
            {
                x.picture = "Uploads/GroupProfile/" + Picture.FileName;
            }

            await db.SaveChangesAsync();
        }

        public async Task<bool> DeleteGroup(int chatid , string Account)
        {
            if (!await db.chatMember.AnyAsync(x => x.chatid.Equals(chatid) && x.username.Equals(Account) && x.IsOwner.Equals(true)))
                return false;

            await db.chatMember.Where(x => x.chatid.Equals(chatid)).ExecuteDeleteAsync();
            await db.SaveChangesAsync();
            await db.Messages.Where(x => x.chatid.Equals(chatid)).ExecuteDeleteAsync();
            await db.SaveChangesAsync();

            return true;
        }

        public async Task<bool> AddMember(int chatid, string target , string account)
        {
            if (!await db.chatMember.AnyAsync(x => x.chatid.Equals(chatid) && x.username.Equals(account) && x.IsOwner.Equals(true)))
                return false;

            List<Chat_Member> list = await db.chatMember.Where(x => x.chatid.Equals(chatid)).ToListAsync();

            if (list.Count > 9)
                return false; 

            Chat_Member chat = await db.chatMember.Where(x => x.chatid == chatid).FirstOrDefaultAsync();
            await db.chatMember.AddAsync(new Chat_Member
            {
                chatid = chatid,
                GroupName = chat.GroupName,
                picture = chat.picture,
                username = target,
                IsGroup = true,
                IsOwner = false,
            });
            
            await db.SaveChangesAsync();

            return true;
        }

        public async Task<bool> RemoveMember(int chatid, string target, string account)
        {
            if (!await db.chatMember.AnyAsync(x => x.chatid.Equals(chatid) && x.username.Equals(account) && x.IsOwner.Equals(true)))
                return false;


            Chat_Member chat = await db.chatMember.Where(x => x.username == target && x.chatid == chatid).FirstOrDefaultAsync();
            db.chatMember.Remove(chat);

            await db.SaveChangesAsync();

            return true;
        }

        public async Task<bool> LeaveGroup(int chatid, string account)
        {
            if (await db.chatMember.AnyAsync(x => x.chatid.Equals(chatid) && x.username.Equals(account) && x.IsOwner.Equals(true)))
                return false;


            Chat_Member chat = await db.chatMember.Where(x => x.username == account && x.chatid == chatid).FirstOrDefaultAsync();
            db.chatMember.Remove(chat);

            await db.SaveChangesAsync();

            return true;
        }


    }


}
