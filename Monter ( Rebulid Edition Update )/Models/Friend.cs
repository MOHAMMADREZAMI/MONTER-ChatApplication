using System.ComponentModel.DataAnnotations;

namespace Monter___Rebulid_Edition_Update__.Models
{
    public class Friend
    {
        [Key]
        public int Id { get; set; }
        public string UserOne { get; set; }
        public string UserTwo { get; set; }
    }
}
