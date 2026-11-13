using System.ComponentModel.DataAnnotations;

namespace Monter___Rebulid_Edition_Update__.Models
{
    public class User
    {
        [Key]
        public string username { get; set; }
        public string password { get; set; }
        public string email { get; set; }
        public string description { get; set; }
        public string status { get; set; }
        public string connectionId { get; set; }
        public string Profile {  get; set; }

    }
}
