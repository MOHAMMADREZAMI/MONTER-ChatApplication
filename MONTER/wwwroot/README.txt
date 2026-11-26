MONTER - wwwroot frontend
=========================

Files
-----
index.html
css/style.css
js/config.js
js/app.js

Installation
------------
1. Extract the ZIP.
2. Copy the contents of the "monter-wwwroot" folder into your ASP.NET Core project's wwwroot folder.
3. Make sure your application serves static files:
       app.UseDefaultFiles();
       app.UseStaticFiles();
   Put these before endpoint mappings as appropriate.
4. Run the API and open it from the same origin. For LAN access, bind Kestrel to
0.0.0.0:7288 and browse to the laptop's LAN IP, for example:
       https://192.168.1.105:7288/

The frontend now uses same-origin relative paths for API and SignalR requests.
Do not set the browser API URL to 0.0.0.0 or localhost when accessing from a phone.
For HTTPS over a LAN IP, the development certificate may not be trusted for that IP;
use a certificate valid for the LAN hostname/IP or accept that the browser may block
the connection until the certificate is trusted.

API contract used
-----------------
All parameters are sent as URL query parameters (not JSON body), because the current
backend actions use simple string parameters such as string username, string email,
and string target. Example:

POST /api/auth/signup?username=...&password=...&email=...
POST /api/auth/login?email=...&password=...
POST /api/Search/Search?target=...
POST /api/Search/AddToChat?Target=...
POST /api/Search/LoadFriends

Expected signup response: HTTP 200.
Expected login response: raw JWT text (HTTP 200).
Search and LoadFriends are expected to return JSON arrays of strings.

SignalR hub
-----------
/chathub
The client connects with accessTokenFactory, so the JWT is sent as the SignalR access token.
The frontend expects these Hub methods and signatures:
    int JoinChat(string targetUsername)
    Task LeaveChat(int chatId)
    Task SendMessage(string content, int chatId)

JoinChat must return the ChatId as an integer. The frontend stores it for the active
conversation, calls LeaveChat(chatId) before switching to another friend, and sends
messages with SendMessage(content, chatId).

Incoming messages:
The frontend listens for the SignalR event "ReceiveMessage".
Your Hub can broadcast either sender + content:
    await Clients.Group($"Chat_{chatId}").SendAsync("ReceiveMessage", sender, content);
The recommended contract is sender username + content, so the UI can distinguish
outgoing messages from incoming ones:
    await Clients.Group($"Chat_{chatId}").SendAsync("ReceiveMessage", senderUsername, content);

Broadcast to Clients.Group (not only OthersInGroup) because the sender's UI also
renders its message from the ReceiveMessage event. A content-only event is supported,
but the sender identity is needed for correct outgoing/incoming styling.

If your server uses a different event name or argument shape, change:
    receiveEvent
in js/config.js, and adjust handleIncomingMessage() in js/app.js.

Important backend notes
-----------------------
- All API calls are POST, as requested. Simple parameters are sent in the query string to match the current controller signatures; no DTO or [FromBody] changes are required.
- Search is debounced by 300ms to avoid flooding the server on every keystroke.
- Friends are reloaded after a successful AddToChat.
- JWT is stored in localStorage under "monter_jwt".
- If your JWT expires, sign out and sign in again. The frontend does not make JWT permanent.
- For SignalR with JWT bearer authentication, configure JwtBearerEvents.OnMessageReceived to read
  access_token from the query string for requests whose path starts with /chathub.
- If frontend and API are served from the same origin, CORS is generally not needed.
- If the API returns non-200 status codes, the response body is displayed as the server error message.

Example JWT bearer event configuration (adapt to your existing AddJwtBearer):
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/chathub"))
                context.Token = accessToken;
            return Task.CompletedTask;
        }
    };

Connection lifecycle
--------------------
When a friend is clicked, the frontend leaves the previously active ChatId (if any),
then invokes JoinChat(targetUsername) and stores the returned ChatId. When the browser
or tab closes, SignalR automatically removes that connection from all groups after the
connection is disconnected. A LeaveChat invocation during page unload is intentionally
not relied upon because browsers do not guarantee that an asynchronous hub call will finish.
After an automatic SignalR reconnect, the frontend invokes JoinChat again for the active friend,
because group membership is not restored automatically.

Security
--------
This is a browser client, so JWT is stored in localStorage for this implementation.
For production, consider secure HttpOnly cookies and appropriate CSRF/XSS protections.


Profile presence
----------------
The frontend first calls POST /api/profile/getFriendsStatus with the JWT and no
parameters. The endpoint is expected to return an array of User objects containing
username and status fields. The UI displays each friend's status as Online or Offline.

After the initial snapshot, the client connects to the authenticated SignalR hub:
    /profilehub

The ProfileHub event contract is:
    await Clients.Users(friendIds)
        .SendAsync("ReceiveStatus", username, "Online"); // or "Offline"

The client listens for ReceiveStatus(username, status) and updates the friend list
and active chat header without refreshing the page. The frontend performs a second
status snapshot after connecting to ProfileHub to reconcile any changes that occur
between the first API request and the SignalR connection.

The existing /chathub connection and ReceiveMessage event remain separate and unchanged.
For JWT bearer authentication, make sure JwtBearerEvents.OnMessageReceived also accepts
access_token for paths starting with /profilehub, in addition to /chathub.


Profile and settings
--------------------
The sidebar Settings button opens the account settings view. Selecting a picture only
creates a local preview; requests are sent after Save is pressed.

The settings form uses:
    POST /api/profile/ChangeProfile
        multipart/form-data field: profile (IFormFile)
    POST /api/profile/ChangeDescription?description=...

The description request is skipped when the field is left blank, to avoid erasing an
existing description because no endpoint for loading the current user's own profile
was supplied. A self-profile endpoint can be added later to prefill this field and
support intentional clearing.

After the API calls succeed, the browser invokes SaveChanges on /profilehub.
The frontend expects the hub to broadcast:
    SendAsync("ReceiveStatus", username, userObject)

The userObject may use camelCase or PascalCase and should include username, profile,
description, and status. Profile values may be absolute URLs or paths relative to the
site origin. Empty profile values use an initials-based default avatar.

If your ChangeProfile action names its IFormFile parameter something other than
"profile", change the FormData key in js/app.js to match that parameter name.


URL resolution fix
------------------
API and SignalR URLs are now resolved directly against window.location.origin.
This avoids "Failed to construct URL: Invalid URL" if a stale/cached config.js
contains a missing or malformed baseUrl. Hard-refresh the browser after replacing
wwwroot files (Ctrl+F5) so the updated app.js is loaded.


UI redesign (messenger look)
----------------------------
Presentation-only change. API calls, SignalR hubs, ids and the logic in js/app.js are untouched
(app.js only had a few text labels edited, plus one small fix so the chat header shows the friend's
presence immediately when a chat is opened).
- index.html : new layout (chat list | conversation | profile panel)
- css/style.css : black / blue / white theme, desktop + phone layouts
- js/ui.js : NEW, UI-only (compact search mode, tap-friend-in-search, phone back button)
Hard-refresh (Ctrl+F5) after replacing the files.

Update: removing a member / deleting a group now asks for confirmation with an in-app dialog
(confirmDialog() in js/app.js) instead of the browser's window.confirm popup.
Group panel: owner and non-owner views now have the same fixed sizes (the Remove button no longer changes the layout).

Media (js/ui.js + css/style.css): video attachments use a custom in-app player (play/pause, seek, time, speed,
mute, full screen) instead of the browser's native controls; clicking an image opens an in-app viewer
(prev/next, zoom, download, Esc / Back to close). Formats the browser cannot decode show a Download button.

Leave group: non-owners get "Leave group" in the group's right-click / long-press menu
(POST /api/group/LeaveGroup?chatid=...). Owners keep "Delete group".
ReceiveRemoveMember (GroupHub) now accepts both ("LoadGroup") and (username, "LoadGroup") and reloads LoadGroup.


PWA setup
---------
- manifest.json and service-worker.js are served from the wwwroot root.
- js/pwa.js registers the service worker and displays an install button when
  the browser exposes the installation prompt.
- On iOS, use Safari > Share > Add to Home Screen.
- The site must be served over HTTPS, except localhost during development.
- The manifest currently references /ico/Monter.svg. Make sure that file exists
  in wwwroot/ico/. Its MIME type must be image/svg+xml.
- For the broadest install compatibility, add dedicated 192x192 and 512x512
  PNG icons and list them in manifest.json as image/png.
- This initial service worker does not cache pages or private chat data.
