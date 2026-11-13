using System.ComponentModel.DataAnnotations;

namespace Monter___Rebulid_Edition_Update__.Models
{
    public class Message
    {
        [Key]
        public int Id { get; set; }

        public int chatid { get; set; } 

        public string Content { get; set; }

        public string File { get; set; }

        public DateTime SentAt { get; set; }

        public string Sender { get; set; }

        public string Receiver { get; set; }

    }
}
