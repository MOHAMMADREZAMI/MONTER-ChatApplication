/* MONTER API configuration */
window.MONTER_CONFIG = {
  // Automatically use the exact origin that served this page:
  // localhost on the laptop, or the laptop's LAN IP on another device.
  baseUrl: window.location.origin,
  endpoints: {
    signup: "/api/auth/signup",
    login: "/api/auth/login",
    search: "/api/Search/Search",
    addToChat: "/api/Search/AddToChat",
    loadFriends: "/api/Search/LoadFriends",
    getFriendsStatus: "/api/profile/getFriendsStatus",
    getProfile: "/api/profile/GetProfile",
    changeProfile: "/api/profile/ChangeProfile",
    changeDescription: "/api/profile/ChangeDescription",
    loadMessages: "/api/message/loadmessage",
    deleteMessage: "/api/message/DeleteMessage",
    createGroup: "/api/group/CreateGroup",
    loadGroup: "/api/group/LoadGroup",
    getGroupMembers: "/api/group/GetGroupMembers",
    hub: "/chathub",
    profileHub: "/profilehub",
    groupHub: "/grouphub",
    changeGroupProfile: "/api/group/ChangeGroupProfile",
    deleteGroup: "/api/group/DeleteGroup"
  },
  // The server should broadcast incoming messages with this SignalR event name.
  receiveEvent: "ReceiveMessage",
  // Change to false only if your API intentionally uses HTTP instead of HTTPS.
  useHttps: true
};
