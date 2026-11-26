using System.ComponentModel.DataAnnotations;

namespace MONTER.Models
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
