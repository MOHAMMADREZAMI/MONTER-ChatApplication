using System.ComponentModel.DataAnnotations;

namespace MONTER.Models
{
    public class Friend
    {
        [Key]
        public int Id { get; set; }
        public string UserOne { get; set; }
        public string UserTwo { get; set; }
    }
}
