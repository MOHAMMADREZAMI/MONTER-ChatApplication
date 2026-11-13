using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Monter___Rebulid_Edition_Update__.Hubs;
using Monter___Rebulid_Edition_Update__.Models;
using Monter___Rebulid_Edition_Update__.Services.Message;

namespace Monter___Rebulid_Edition_Update__.Controllers.MessageController
{
    [Route("api/message")]
    [ApiController]
    public class MessageController : ControllerBase
    {
        private Messager message;
        IHubContext<ChatHub> hub;
        public MessageController(Messager _message,IHubContext<ChatHub> context)
        {
            message = _message;
            hub = context;
        }

        //[Authorize]
        //[HttpPost("ConnectionId")]
        //public async Task<string> GetConnectionId(string target)
        //{
        //    return await message.GetConnectionId(target);
        //}

        [Authorize]
        [HttpPost("loadmessage")]
        public async Task<List<Message>> LoadMessages(int chatid)
        {
            return await message.loadMessage(chatid);
        }

        [Authorize]
        [HttpPost("DeleteMessage")]
        public async Task DeleteMessage(int MessageId,int chatid)
        {
            await message.DeleteMessage(MessageId);
            await hub.Clients.Group(chatid + "room").SendAsync("MessageDeleted",MessageId);

        }


        


    }
}
