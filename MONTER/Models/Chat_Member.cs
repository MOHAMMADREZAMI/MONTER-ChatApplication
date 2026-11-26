using System.ComponentModel.DataAnnotations;

namespace MONTER.Models
{
    public class Chat_Member
    {
        [Key]
        public int id { get; set; }
        public int chatid { get; set; }
        public string username { get; set; }
        public bool IsGroup { get; set; }
        public string GroupName { get; set; }
        public string picture { get; set; }
        public bool IsOwner { get; set; }

    }
}
