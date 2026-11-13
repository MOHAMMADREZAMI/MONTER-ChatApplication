(() => {
  "use strict";

  // Merge defaults with the page configuration. This also protects against an
  // older cached config.js that does not yet contain the GetProfile endpoint.
  const suppliedConfig = window.MONTER_CONFIG || {};
  const cfg = {
    ...suppliedConfig,
    baseUrl: (typeof suppliedConfig.baseUrl === "string" && suppliedConfig.baseUrl.trim())
      ? suppliedConfig.baseUrl : window.location.origin,
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
      addMember: "/api/group/AddMember",
      removeMember: "/api/group/RemoveMember",
      hub: "/chathub",
      profileHub: "/profilehub",
      groupHub: "/grouphub",
      changeGroupProfile: "/api/group/ChangeGroupProfile",
      deleteGroup: "/api/group/DeleteGroup",
      ...Object.fromEntries(Object.entries(suppliedConfig.endpoints || {})
        .filter(([key, value]) => typeof value === "string" && value.trim()))
    }
  };
  window.MONTER_CONFIG = cfg;
  const $ = (id) => document.getElementById(id);
  const state = {
    token: localStorage.getItem("monter_jwt"),
    username: "",
    searchTimer: null,
    activeFriend: null,
    activeChatId: null,
    hub: null,
    hubReady: null,
    profileHub: null,
    profileHubReady: null,
    groupHub: null,
    groupHubReady: null,
    friendStatuses: new Map(),
    friendProfiles: new Map(),
    currentProfileUrl: "",
    selectedProfileFile: null,
    selectedChatFile: null,
    selfProfile: null,
    friendProfileDetails: null,
    chatSwitchQueue: Promise.resolve(),
    messagesLoadToken: 0,
    friends: [],
    groups: [],
    activeGroup: null,     // { chatId, name, picture } of the open group
    groupChatId: null,     // joined SignalR chat id of the open group (kept apart from activeChatId)
    groupMembers: [],
    sidebarMode: "friends",
    panelMode: null,       // what the right-hand panel shows: "friend" | "self" | "group"
    toastTimer: null
  };

  const authView = $("authView"), mainView = $("mainView");
  const signupForm = $("signupForm"), loginForm = $("loginForm");
  const authMessage = $("authMessage");

  // Resolve every API/SignalR endpoint against the origin serving this page.
  // This avoids malformed URLs if an older cached config.js has no valid baseUrl.
  function url(endpoint) {
    if (typeof endpoint !== "string" || !endpoint.trim()) {
      throw new Error("MONTER endpoint is missing or invalid. Check js/config.js and clear the browser cache.");
    }
    try {
      return new URL(endpoint.trim(), window.location.origin).toString();
    } catch {
      throw new Error(`Invalid MONTER endpoint: ${String(endpoint)}`);
    }
  }
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }
  function showAuthMessage(message, success = false) {
    authMessage.textContent = message;
    authMessage.classList.remove("hidden", "success");
    if (success) authMessage.classList.add("success");
  }
  function clearAuthMessage() { authMessage.textContent = ""; authMessage.classList.add("hidden"); }
  function switchAuth(mode) {
    clearAuthMessage();
    const isSignup = mode === "signup";
    signupForm.classList.toggle("hidden", !isSignup);
    loginForm.classList.toggle("hidden", isSignup);
    $("authTitle").textContent = isSignup ? "Create your account" : "Welcome back";
    $("authSubtitle").textContent = isSignup ? "Join MONTER and start meaningful conversations." : "Sign in to continue to your conversations.";
    $("switchText").textContent = isSignup ? "Already have an account?" : "New to MONTER?";
    $("switchAuth").textContent = isSignup ? "Sign in" : "Create account";
  }
  $("switchAuth").addEventListener("click", () => switchAuth(signupForm.classList.contains("hidden") ? "signup" : "login"));

  // UI-only navigation: search is an overlay rather than a permanent desktop panel.
  const searchPanel = $("searchPanel");
  const openSearch = () => {
    searchPanel.classList.remove("hidden");
    requestAnimationFrame(() => $("searchInput").focus());
  };
  const closeSearch = () => searchPanel.classList.add("hidden");
  $("searchToggle")?.addEventListener("click", openSearch);
  $("mobileSearchButton")?.addEventListener("click", openSearch);
  $("closeSearch")?.addEventListener("click", closeSearch);
  $("mobileMenuButton")?.addEventListener("click", () => {
    if (mainView.classList.contains("chat-open")) $("chatBackButton").click();
  });
  $("searchInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSearch();
  });

  async function readResponse(response) {
    const text = await response.text();
    if (!text) return "";
    try { return JSON.parse(text); } catch { return text; }
  }
  function responseMessage(data, fallback) {
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      if (data.message || data.error) return data.message || data.error;
      if (data.errors && typeof data.errors === "object") {
        const details = Object.entries(data.errors)
          .flatMap(([field, messages]) => (Array.isArray(messages) ? messages : [messages])
            .map(message => `${field}: ${message}`))
          .filter(Boolean);
        if (details.length) return details.join(" | ");
      }
      return data.title || fallback;
    }
    return fallback;
  }
  async function post(endpoint, parameters, authenticated = false) {
    // Current backend actions accept simple string parameters (username, email, target, etc.).
    // With [ApiController], these are normally bound from the query string, not a JSON body.
    const headers = {};
    if (authenticated && state.token) headers.Authorization = `Bearer ${state.token}`;

    const requestUrl = new URL(url(endpoint));
    if (parameters && typeof parameters === "object") {
      for (const [key, value] of Object.entries(parameters)) {
        if (Array.isArray(value)) {
          // string[] parameters are sent as repeated keys: members=a&members=b
          value.forEach(item => requestUrl.searchParams.append(key, String(item)));
        } else if (value !== undefined && value !== null) {
          requestUrl.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(requestUrl.toString(), {
      method: "POST",
      headers
    });
    const data = await readResponse(response);
    return { ok: response.ok, status: response.status, data };
  }
  async function uploadProfile(file) {
    const formData = new FormData();
    // The ASP.NET action parameter is named `Picture`; FormData must use the same key.
    formData.append("Picture", file);
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url(cfg.endpoints.changeProfile), {
      method: "POST",
      headers,
      body: formData
    });
    const data = await readResponse(response);
    return { ok: response.ok, status: response.status, data };
  }

  function profileSource(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    try { return new URL(raw, (cfg.baseUrl || window.location.origin).replace(/\/$/, "") + "/").href; }
    catch { return ""; }
  }

  function createAvatar(username, profile, className = "avatar") {
    const avatar = document.createElement("div");
    avatar.className = className;
    avatar.textContent = initials(username);
    const src = profileSource(profile);
    if (src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = `${username || "User"} profile`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.remove();
        avatar.textContent = initials(username);
      }, { once: true });
      avatar.textContent = "";
      avatar.append(image);
    }
    return avatar;
  }

  function getFriendProfile(username) {
    return state.friendProfiles.get(String(username || "").toLowerCase()) || null;
  }

  function setBusy(form, busy) {
    const button = form.querySelector("button[type=submit]");
    button.disabled = busy;
    button.dataset.originalText ||= button.textContent;
    button.textContent = busy ? "Please wait..." : button.dataset.originalText;
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault(); clearAuthMessage();
    const values = Object.fromEntries(new FormData(signupForm));
    setBusy(signupForm, true);
    try {
      const result = await post(cfg.endpoints.signup, {
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password
      });
      if (result.status === 200) {
        showAuthMessage("Account created successfully. Please sign in.", true);
        switchAuth("login");
        showAuthMessage("Account created successfully. Please sign in.", true);
        loginForm.elements.email.value = values.email.trim();
      } else {
        showAuthMessage(responseMessage(result.data, `Account creation failed (HTTP ${result.status}).`));
      }
    } catch (error) { showAuthMessage(`Could not reach the server: ${error.message}`); }
    finally { setBusy(signupForm, false); }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); clearAuthMessage();
    const values = Object.fromEntries(new FormData(loginForm));
    setBusy(loginForm, true);
    try {
      const result = await post(cfg.endpoints.login, {
        email: values.email.trim(),
        password: values.password
      });
      if (result.status === 200) {
        // Your API returns the JWT as plain text, not a JSON object.
        const token = typeof result.data === "string" ? result.data.trim() : (result.data?.token || result.data?.jwt || "");
        if (!token) {
          showAuthMessage("Login returned HTTP 200, but no JWT was found in the response.");
          return;
        }
        state.token = token;
        localStorage.setItem("monter_jwt", token);
        enterApp();
      } else {
        showAuthMessage(responseMessage(result.data, `Login failed (HTTP ${result.status}).`));
      }
    } catch (error) { showAuthMessage(`Could not reach the server: ${error.message}`); }
    finally { setBusy(loginForm, false); }
  });

  function decodeJwtPayload(token) {
    try {
      const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const decoded = decodeURIComponent(atob(part).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
      return JSON.parse(decoded);
    } catch { return {}; }
  }
  async function enterApp() {
    const payload = decodeJwtPayload(state.token);
    state.username = payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] || payload.sub || "MONTER User";
    authView.classList.add("hidden"); mainView.classList.remove("hidden");
    $("myUsername").textContent = state.username;

    await loadSelfProfile();
    await loadFriendsStatus();
    await connectProfileHub();
    await connectGroupHub();
    await loadFriendsStatus();

    connectHub();
    await loadFriends();
    await loadGroups(); // LoadGroup runs once when the user enters the app
  }
  function showAuth() {
    mainView.classList.add("hidden"); authView.classList.remove("hidden");
    switchAuth("login");
  }

  async function logout() {
    if (state.hub) { try { await state.hub.stop(); } catch {} }
    if (state.profileHub) { try { await state.profileHub.stop(); } catch {} }
    if (state.groupHub) { try { await state.groupHub.stop(); } catch {} }
    state.hub = null;
    state.hubReady = null;
    state.profileHub = null;
    state.profileHubReady = null;
    state.groupHub = null;
    state.groupHubReady = null;
    state.friendStatuses.clear();
    state.friendProfiles.clear();
    state.friends = [];
    state.token = null;
    localStorage.removeItem("monter_jwt");
    state.activeFriend = null;
    state.activeChatId = null;
    state.activeGroup = null;
    state.groupChatId = null;
    state.groupMembers = [];
    state.groups = [];
    state.panelMode = null;
    state.messagesLoadToken += 1;
    mainView.classList.remove("chat-open");
    setSidebarMode("friends");
    renderGroups();
    $("settingsView").classList.add("hidden");
    $("contentGrid").classList.remove("hidden");
    mainView.classList.remove("settings-open");
    showAuth();
    showToast("You have signed out.");
  }
  $("settingsLogout").addEventListener("click", logout);

  function normalizePresenceStatus(value) {
    if (value === true) return "Online";
    if (value === false) return "Offline";
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "online" ? "Online" : "Offline";
  }

  // Store a user's profile/status in the shared map (friends AND group members).
  function rememberUser(user) {
    if (!user) return "";
    const username = user.username ?? user.Username;
    if (!username) return "";
    const key = String(username).toLowerCase();
    state.friendProfiles.set(key, {
      username: String(username),
      status: normalizePresenceStatus(user.status ?? user.Status),
      profile: user.profile ?? user.Profile ?? user.picture ?? user.Picture ?? "",
      description: user.description ?? user.Description ?? ""
    });
    return key;
  }

  // Keep group UI (sender avatars in messages + members panel) in sync with live updates.
  function refreshGroupUi(key) {
    refreshSenderAvatars(key);
    if (state.activeGroup && state.panelMode === "group" && !$("friendProfilePanel").classList.contains("hidden")) {
      renderGroupMembers();
    }
  }

  function updateFriendUser(user) {
    const key = rememberUser(user);
    if (!key) return;
    renderFriends();
    refreshGroupUi(key);
    if (state.activeFriend && state.activeFriend.toLowerCase() === key) {
      renderActiveFriendStatus();
      renderActiveFriendProfile();
    }
  }

  function setFriendStatus(username, payload) {
    if (!username) return;
    const key = String(username).toLowerCase();
    if (payload && typeof payload === "object") {
      updateFriendUser({ ...payload, username: payload.username ?? payload.Username ?? username });
      return;
    }
    const existing = state.friendProfiles.get(key) || { username, profile: "", description: "" };
    existing.status = normalizePresenceStatus(payload);
    state.friendProfiles.set(key, existing);
    state.friendStatuses.set(key, existing.status);
    renderFriends();
    refreshGroupUi(key);
    if (state.activeFriend && state.activeFriend.toLowerCase() === key) renderActiveFriendStatus();
  }

  function getFriendStatus(username) {
    const profile = getFriendProfile(username);
    return profile?.status || state.friendStatuses.get(String(username || "").toLowerCase()) || "Offline";
  }

  function renderActiveFriendStatus() {
    const statusElement = $("chatStatus");
    if (!statusElement || !state.activeFriend) return;
    const status = getFriendStatus(state.activeFriend);
    statusElement.textContent = status;
    statusElement.classList.toggle("is-online", status === "Online");
    statusElement.classList.toggle("is-offline", status !== "Online");
  }

  function renderActiveFriendProfile() {
    if (!state.activeFriend) return;
    const profile = getFriendProfile(state.activeFriend);
    const header = $("chatAvatar");
    if (header) {
      const replacement = createAvatar(state.activeFriend, profile?.profile, "avatar");
      replacement.id = "chatAvatar";
      header.replaceWith(replacement);
    }
    const panelStatus = $("friendProfileContent")?.querySelector(".profile-detail-status");
    if (panelStatus && profile?.status) {
      panelStatus.classList.toggle("is-online", profile.status === "Online");
      panelStatus.classList.toggle("is-offline", profile.status !== "Online");
      panelStatus.lastChild.textContent = profile.status;
    }
  }

  function readUserField(user, ...keys) {
    if (!user || typeof user !== "object") return "";
    for (const key of keys) {
      if (user[key] !== undefined && user[key] !== null) return user[key];
    }
    return "";
  }

  function renderProfileCard(container, user, fallbackUsername, { alwaysOnline = false } = {}) {
    container.innerHTML = "";
    if (!user) {
      const empty = document.createElement("div");
      empty.className = "profile-loading";
      empty.textContent = "Profile information is unavailable.";
      container.append(empty);
      return;
    }

    const username = String(readUserField(user, "username", "Username") || fallbackUsername || "MONTER User");
    const picture = readUserField(user, "profile", "Profile");
    const description = String(readUserField(user, "description", "Description") || "No description yet.");
    // The signed-in user's own profile is always shown as Online (Status field ignored).
    const status = alwaysOnline ? "Online" : normalizePresenceStatus(readUserField(user, "status", "Status"));
    const avatar = createAvatar(username, picture, "profile-large-avatar");
    const name = document.createElement("strong");
    name.className = "profile-detail-name";
    name.textContent = username;
    const presence = document.createElement("span");
    presence.className = `profile-detail-status ${status === "Online" ? "is-online" : "is-offline"}`;
    const dot = document.createElement("i");
    presence.append(dot, document.createTextNode(status));
    const bioTitle = document.createElement("span");
    bioTitle.className = "profile-description-label";
    bioTitle.textContent = "ABOUT";
    const bio = document.createElement("p");
    bio.className = "profile-description";
    bio.textContent = description;
    const identity = document.createElement("div");
    identity.className = "profile-identity";
    identity.append(avatar, name, presence);
    container.append(identity, bioTitle, bio);
  }

  async function fetchProfile(target) {
    // GetProfile is POST; omit `target` entirely for the authenticated user's own profile.
    const result = await post(cfg.endpoints.getProfile, target ? { target } : undefined, true);
    if (!result.ok) {
      throw new Error(responseMessage(result.data, `GetProfile failed (HTTP ${result.status}).`));
    }
    return result.data;
  }

  async function loadSelfProfile() {
    const card = $("selfProfileCard");
    const status = $("selfProfileStatus");
    try {
      const profile = await fetchProfile("");
      state.selfProfile = profile;
      const username = readUserField(profile, "username", "Username") || state.username;
      const picture = readUserField(profile, "profile", "Profile");
      const avatar = createAvatar(username, picture, "avatar self-avatar");
      avatar.id = "selfAvatar";
      $("selfAvatar").replaceWith(avatar);
      $("myUsername").textContent = username;
      const presence = "Online"; // own profile: always Online, Status from GetProfile is ignored
      status.textContent = presence;
      status.classList.toggle("is-online", presence === "Online");
      status.classList.toggle("is-offline", presence !== "Online");
    } catch (error) {
      console.error("Could not load your profile:", error);
      $("myUsername").textContent = state.username;
      if (status) status.textContent = "Profile unavailable";
    }
  }

  let profileCloseTimer = null;
  async function loadFriendProfile(target) {
    const panel = $("friendProfilePanel");
    const content = $("friendProfileContent");
    window.clearTimeout(profileCloseTimer);
    state.panelMode = "friend";
    panel.classList.remove("hidden");
    panel.classList.add("is-open");
    $("profilePanelEyebrow").textContent = "CONTACT";
    $("profilePanelTitle").textContent = "Profile";
    content.innerHTML = `<div class="profile-loading"><span class="profile-spinner"></span><span>Loading ${escapeHtml(target)}'s profile</span></div>`;
    try {
      const profile = await fetchProfile(target);
      // Ignore a late response if the user has switched to another friend.
      if (state.activeFriend !== target) return;
      state.friendProfileDetails = profile;
      renderProfileCard(content, profile, target);
    } catch (error) {
      console.error("Could not load friend profile:", error);
      content.innerHTML = "";
      const message = document.createElement("div");
      message.className = "profile-loading profile-error";
      message.textContent = error.message || "Could not load this profile.";
      content.append(message);
    }
  }

  function closeFriendProfile() {
    const panel = $("friendProfilePanel");
    panel.classList.remove("is-open");
    state.panelMode = null;
    window.clearTimeout(profileCloseTimer);
    profileCloseTimer = window.setTimeout(() => panel.classList.add("hidden"), 220);
  }
  // Close instantly (no animation), used when switching/leaving a chat.
  function closeFriendProfileNow() {
    const panel = $("friendProfilePanel");
    window.clearTimeout(profileCloseTimer);
    panel.classList.remove("is-open");
    panel.classList.add("hidden");
    state.friendProfileDetails = null;
    state.panelMode = null;
  }
  $("closeFriendProfile").addEventListener("click", closeFriendProfile);
  $("chatDetailsButton")?.addEventListener("click", () => $("chatProfileToggle").click());
  function toggleChatDetails() {
    const panel = $("friendProfilePanel");
    if (state.activeGroup) {
      if (panel.classList.contains("hidden") || state.panelMode !== "group") {
        openGroupPanel();
      } else {
        closeFriendProfile();
      }
      return;
    }
    if (!state.activeFriend) return;
    if (panel.classList.contains("hidden")) loadFriendProfile(state.activeFriend);
    else closeFriendProfile();
  }

  // The whole chat header is the hit target on mobile. Keeping the handler
  // here (instead of relying only on the tiny details icon) makes group
  // members reachable even on narrow touch screens.
  $("chatProfileToggle").addEventListener("click", toggleChatDetails);
  $("chatAvatar").addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleChatDetails();
  });
  $("chatName").addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleChatDetails();
  });
  $("selfProfileCard").addEventListener("click", async () => {
    try {
      const profile = await fetchProfile("");
      state.selfProfile = profile;
      // Refresh the compact bottom-left identity from the same GetProfile endpoint.
      $("profilePanelEyebrow").textContent = "YOUR ACCOUNT";
      $("profilePanelTitle").textContent = "Your profile";
      renderProfileCard($("friendProfileContent"), profile, state.username, { alwaysOnline: true });
      state.panelMode = "self";
      const panel = $("friendProfilePanel");
      panel.classList.remove("hidden");
      requestAnimationFrame(() => panel.classList.add("is-open"));
    } catch (error) {
      showToast(error.message || "Could not load your profile.");
    }
  });

  async function loadFriendsStatus() {
    try {
      const result = await post(cfg.endpoints.getFriendsStatus, undefined, true);
      if (!result.ok) {
        console.error(`GetFriendsStatus failed (HTTP ${result.status}):`, result.data);
        return false;
      }
      const users = Array.isArray(result.data) ? result.data : [];
      users.forEach(user => {
        const username = user?.username ?? user?.Username;
        if (!username) return;
        updateFriendUser(user);
        state.friendStatuses.set(String(username).toLowerCase(), normalizePresenceStatus(user.status ?? user.Status));
      });
      renderFriends();
      renderActiveFriendStatus();
      return true;
    } catch (error) {
      console.error("Could not load friends status:", error);
      return false;
    }
  }

  async function connectProfileHub() {
    if (!window.signalR) {
      showToast("SignalR library could not load. Profile status is unavailable.");
      return false;
    }

    if (state.profileHub) {
      try { await state.profileHub.stop(); } catch {}
    }

    state.profileHub = new signalR.HubConnectionBuilder()
      .withUrl(url(cfg.endpoints.profileHub), {
        accessTokenFactory: () => state.token
      })
      .withAutomaticReconnect()
      .build();

    // ReceiveStatus may contain either a legacy status string or the full User object.
    state.profileHub.on("ReceiveStatus", (username, userOrStatus) => {
      setFriendStatus(username, userOrStatus);
    });

    // When another user adds the current user as a friend, the backend sends
    // ReceiveAddFriend("Refresh"). Refresh both the friend list and the
    // current online/offline statuses for the newly added friend.
    state.profileHub.on("ReceiveAddFriend", async (message) => {
      if (message !== "Refresh") return;
      try {
        await Promise.all([
          loadFriends(),
          loadFriendsStatus()
        ]);
        // If the search box is currently showing results, update its buttons
        // too so the newly added friend immediately appears as already added.
        if (searchInput.value.trim()) {
          await searchUsers(searchInput.value.trim());
        }
      } catch (error) {
        console.error("ReceiveAddFriend refresh failed:", error);
      }
    });

    state.profileHub.onreconnecting(error => {
      console.warn("ProfileHub reconnecting:", error);
    });

    state.profileHub.onreconnected(async () => {
      console.info("ProfileHub reconnected");
      await loadFriendsStatus();
    });

    state.profileHub.onclose(error => {
      if (error) console.error("ProfileHub connection closed:", error);
    });

    state.profileHubReady = state.profileHub.start()
      .then(() => {
        console.info("MONTER ProfileHub connected");
        return true;
      })
      .catch(error => {
        console.error("ProfileHub connection error:", error);
        showToast("Could not connect to profile hub. Live status updates are unavailable.");
        return false;
      });

    return state.profileHubReady;
  }

  async function connectGroupHub() {
    if (!window.signalR) return false;
    if (state.groupHub) {
      try { await state.groupHub.stop(); } catch {}
    }

    state.groupHub = new signalR.HubConnectionBuilder()
      .withUrl(url(cfg.endpoints.groupHub), { accessTokenFactory: () => state.token })
      .withAutomaticReconnect()
      .build();

    // The server must include chatid as the third ReceiveProfile argument so
    // a member of multiple groups never updates the wrong group's picture.
    state.groupHub.on("ReceiveProfile", (username, picture, chatId) => {
      // ReceiveProfile must carry the chat id as its third argument. A user can
      // belong to multiple groups, so username + picture alone is ambiguous.
      const receivedChatId = Number(chatId);
      if (!Number.isInteger(receivedChatId) || receivedChatId <= 0) {
        console.warn("ReceiveProfile was received without a valid chatid. Update the GroupHub server event to send (username, picture, chatid).", {
          username, picture, chatId
        });
        return;
      }
      console.info("Group profile update received:", { username, chatId: receivedChatId });
      applyGroupPicture(receivedChatId, picture);
    });

    // When a group is created, every recipient (including the creator) refreshes
    // their group list from the server. This keeps LoadGroup as the single source
    // of truth instead of trying to construct the new Chat_Member row locally.
    state.groupHub.on("ReceiveAddMember", async (username, message) => {
      if (message !== "LoadGroup") return;
      try {
        await loadGroups();
      } catch (error) {
        console.error("ReceiveAddMember -> LoadGroup failed:", error);
      }
    });

    // Only the member who was removed receives this event. Refresh their group list
    // and close the currently open group if it disappeared from LoadGroup.
    state.groupHub.on("ReceiveRemoveMember", async (username, message) => {
      if (message !== "LoadGroup") return;
      try {
        const activeChatId = state.activeGroup?.chatId ?? null;
        await loadGroups();
        if (activeChatId !== null && !state.groups.some(group => group.chatId === activeChatId)) {
          await closeChatInternal();
        }
      } catch (error) {
        console.error("ReceiveRemoveMember -> LoadGroup failed:", error);
      }
    });

    state.groupHub.on("ReceiveCreateGroup", async (username, message) => {
      if (message !== "LoadGroup") return;
      try {
        await loadGroups();
      } catch (error) {
        console.error("ReceiveCreateGroup -> LoadGroup failed:", error);
      }
    });

    // Group deletion is identified by chatid because a user may belong to
    // multiple groups. Never remove a different group based only on the sender.
    // IMPORTANT: recipients must NOT get a deletion toast. The owner who
    // performed the deletion gets that local notification in deleteGroup().
    state.groupHub.on("ReceiveDeleteGroup", (username, message, chatId) => {
      const deletedChatId = Number(chatId);
      if (!Number.isInteger(deletedChatId) || deletedChatId <= 0) {
        console.warn("ReceiveDeleteGroup arrived without a valid chatid:", { username, message, chatId });
        return;
      }
      const deletedGroup = state.groups.find(group => group.chatId === deletedChatId);
      state.groups = state.groups.filter(group => group.chatId !== deletedChatId);
      if (state.activeGroup?.chatId === deletedChatId) {
        state.messagesLoadToken += 1;
        state.activeFriend = null;
        state.activeGroup = null;
        state.activeChatId = null;
        state.groupChatId = null;
        state.groupMembers = [];
        closeFriendProfileNow();
        $("chatActive").classList.add("hidden");
        $("chatEmpty").classList.remove("hidden");
        mainView.classList.remove("chat-open");
      }
      renderGroups();
      // Do not show a notification here. This event is delivered to the other
      // members; only the user who actually deleted the group should see the
      // deletion notification.
    });

    state.groupHub.onreconnecting(error => console.warn("GroupHub reconnecting:", error));
    state.groupHub.onreconnected(() => console.info("MONTER GroupHub reconnected"));
    state.groupHub.onclose(error => {
      if (error) console.error("GroupHub connection closed:", error);
    });

    state.groupHubReady = state.groupHub.start()
      .then(() => { console.info("MONTER GroupHub connected"); return true; })
      .catch(error => {
        console.error("GroupHub connection error:", error);
        showToast("Could not connect to GroupHub. Group profile live updates are unavailable.");
        return false;
      });
    return state.groupHubReady;
  }

  function connectHub() {
    if (!window.signalR) {
      showToast("SignalR library could not load. Check your internet connection.");
      return;
    }
    if (state.hub) state.hub.stop().catch(() => {});
    state.hub = new signalR.HubConnectionBuilder()
      .withUrl(url(cfg.endpoints.hub), {
        accessTokenFactory: () => state.token
      })
      .withAutomaticReconnect()
      .build();

    // Expected server event: Clients.Caller/Clients.Client(...).SendAsync("ReceiveMessage", ...).
    state.hub.on(cfg.receiveEvent, (...args) => handleIncomingMessage(args));
    // The server broadcasts MessageDeleted(messageId) to the chat room after a delete.
    // Accepts a plain id or an object such as { messageId } / { MessageId } / { id }.
    state.hub.on("MessageDeleted", payload => {
      const rawId = (payload && typeof payload === "object")
        ? (payload.messageId ?? payload.MessageId ?? payload.id ?? payload.Id)
        : payload;
      if (rawId === undefined || rawId === null) return;
      const bubble = messagesEl.querySelector(`[data-message-id="${CSS.escape(String(rawId))}"]`);
      if (bubble) removeMessageBubble(bubble);
    });
    state.hub.onreconnecting(() => {
      state.activeChatId = null;
      state.groupChatId = null;
      showToast("Chat connection interrupted. Reconnecting...");
    });
    state.hub.onreconnected(async () => {
      showToast("Chat connection restored.");
      // SignalR group membership is not restored automatically after reconnect.
      // Rejoin the conversation that is currently open.
      if (state.activeGroup) {
        const groupId = state.activeGroup.chatId;
        try {
          await state.hub.invoke("JoinChat", "", groupId);
          state.groupChatId = groupId;
          await loadChatMessages(groupId);
          loadGroupMembers(groupId);
        } catch (error) {
          state.groupChatId = null;
          console.error("Could not rejoin active group:", error);
          showToast("Could not rejoin the active group.");
        }
        return;
      }
      if (!state.activeFriend) return;
      try {
        const chatId = await state.hub.invoke("JoinChat", state.activeFriend, 0);
        if (Number.isInteger(chatId) && chatId > 0) {
          state.activeChatId = chatId;
          await loadChatMessages(chatId);
        } else {
          state.activeChatId = null;
          showToast("Could not restore the active conversation.");
        }
      } catch (error) {
        state.activeChatId = null;
        console.error("Could not rejoin active chat:", error);
        showToast("Could not rejoin the active conversation.");
      }
    });
    state.hub.onclose(() => {
      state.activeChatId = null;
      showToast("Chat connection closed.");
    });
    state.hubReady = state.hub.start()
      .then(() => {
        console.info("MONTER SignalR connected");
        return true;
      })
      .catch(error => {
        console.error("SignalR connection error:", error);
        showToast("Could not connect to chat hub. Check JWT settings and CORS.");
        return false;
      });
  }

  // The chat id of whatever is open right now: the group's id, or the friend chat's id.
  function currentChatId() {
    return state.activeGroup ? state.groupChatId : state.activeChatId;
  }

  function handleIncomingMessage(args) {
    // Accept a Message object or positional SignalR arguments.
    // Supported positional shapes include (sender, content), (content, sender),
    // and either shape with an additional numeric chatId.
    let raw = null;

    if (args[0] && typeof args[0] === "object") {
      raw = args[0];
    } else {
      const values = args.map(value => value == null ? "" : String(value));
      const participants = [state.username, state.activeFriend, ...state.groupMembers.map(member => member.username)]
        .filter(Boolean)
        .map(value => value.toLowerCase());
      const senderIndex = values.findIndex(value =>
        participants.includes(value.toLowerCase())
      );

      if (senderIndex >= 0) {
        const sender = values[senderIndex];
        const contentIndex = values.findIndex((value, index) =>
          index !== senderIndex && value.trim() !== "" && !/^\d+$/.test(value)
        );
        const chatIdValue = values.find((value, index) =>
          index !== senderIndex && /^\d+$/.test(value)
        );
        raw = {
          Sender: sender,
          Content: contentIndex >= 0 ? values[contentIndex] : "",
          chatid: chatIdValue || currentChatId(),
          SentAt: new Date().toISOString()
        };
      } else if (values.length >= 2) {
        // Legacy fallback: ReceiveMessage(sender, content[, chatId]).
        raw = {
          Sender: values[0],
          Content: values[1],
          chatid: values.find((value, index) => index > 1 && /^\d+$/.test(value)) || currentChatId(),
          SentAt: new Date().toISOString()
        };
      } else {
        console.warn("ReceiveMessage arrived without sender information; cannot identify message ownership.", args);
        return;
      }
    }

    const message = normalizeMessage(raw || {});
    if (!message.Content && !message.File) {
      console.warn("ReceiveMessage did not contain text or an attachment.", args);
      return;
    }
    if (message.chatid !== null && message.chatid !== "" &&
        Number(message.chatid) !== Number(currentChatId())) return;
    if (!message.Sender) {
      console.warn("ReceiveMessage arrived without a Sender field.", args);
      return;
    }

    const sender = String(message.Sender).toLowerCase();
    if (sender === String(state.username).toLowerCase()) {
      appendMessage(message, "outgoing");
    } else if (state.activeGroup || sender === String(state.activeFriend || "").toLowerCase()) {
      // In a group every other member is "incoming"; the sender's profile is shown on the message.
      appendMessage(message, "incoming");
    } else {
      console.warn("ReceiveMessage sender does not match the active conversation.", message);
    }
  }

  function normalizeMessage(raw) {
    return {
      Id: raw.Id ?? raw.id ?? null,
      chatid: raw.chatid ?? raw.ChatId ?? raw.chatId ?? null,
      Content: raw.Content ?? raw.content ?? raw.Message ?? raw.message ?? "",
      SentAt: raw.SentAt ?? raw.sentAt ?? raw.sentat ?? new Date().toISOString(),
      Sender: raw.Sender ?? raw.sender ?? raw.Username ?? raw.username ?? "",
      Receiver: raw.Receiver ?? raw.receiver ?? "",
      File: raw.File ?? raw.file ?? raw.FilePath ?? raw.filePath ?? ""
    };
  }

  // ---- Conversation scrolling ----
  // pinnedToBottom: true while the user is at (or near) the newest message.
  // Late-loading images/videos and the mobile keyboard change the height after
  // we scroll, so we keep re-scrolling while pinned instead of scrolling once.
  const messagesEl = $("messages");
  let pinnedToBottom = true;
  function scrollMessagesToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
  function followIfPinned() { if (pinnedToBottom) scrollMessagesToBottom(); }
  function pinToBottom() {
    pinnedToBottom = true;
    scrollMessagesToBottom();
    requestAnimationFrame(() => {
      scrollMessagesToBottom();
      requestAnimationFrame(scrollMessagesToBottom);
    });
    window.setTimeout(followIfPinned, 250);
  }
  messagesEl.addEventListener("scroll", () => {
    pinnedToBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
  }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(followIfPinned).observe(messagesEl);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", followIfPinned);


  // ---- Delete message ----
  // Desktop: trash button appears on hover. Touch devices: long-press a message -> red "Delete".
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  // Remove a message bubble from the chat (used after our own delete and when
  // the server tells us the other person deleted one).
  function removeMessageBubble(bubble) {
    if (!bubble || bubble.classList.contains("is-removed")) return;
    bubble.classList.add("is-removed");
    window.setTimeout(() => {
      (bubble.closest(".message-row") || bubble).remove();
      if (!messagesEl.querySelector(".message")) {
        messagesEl.innerHTML = `<div class="message-system">This is the beginning of your conversation.</div>`;
      }
      followIfPinned();
    }, 180);
  }

  async function deleteMessageById(rawId, bubble) {
    const messageId = Number(rawId);
    const currentUser = String(state.username || "").trim().toLowerCase();
    const owner = String(bubble?.dataset?.owner || "").trim().toLowerCase();
    if (!Number.isInteger(messageId) || bubble.dataset.deleting === "1") return;
    if (!currentUser || owner !== currentUser || bubble.dataset.mine !== "1") {
      showToast("You can only delete your own messages.");
      return;
    }
    bubble.dataset.deleting = "1";
    bubble.classList.add("is-deleting");
    try {
      // DeleteMessage(int MessageId, int chatid)
      const result = await post(cfg.endpoints.deleteMessage, { MessageId: messageId, chatid: currentChatId() }, true);
      if (!result.ok) {
        throw new Error(responseMessage(result.data, `Could not delete the message (HTTP ${result.status}).`));
      }
      removeMessageBubble(bubble);
    } catch (error) {
      console.error("DeleteMessage failed:", error);
      bubble.dataset.deleting = "";
      bubble.classList.remove("is-deleting");
      showToast(error.message || "Could not delete the message.");
    }
  }

  messagesEl.addEventListener("click", event => {
    const button = event.target.closest(".message-delete-btn");
    if (!button) return;
    const bubble = button.closest(".message");
    if (bubble) deleteMessageById(bubble.dataset.messageId, bubble);
  });

  // Long-press action sheet (touch)
  const messageSheet = document.createElement("div");
  messageSheet.className = "message-sheet hidden";
  messageSheet.innerHTML = '<div class="message-sheet-backdrop"></div>' +
    '<div class="message-sheet-panel" role="menu">' +
    '<button type="button" class="message-sheet-delete" role="menuitem">Delete</button>' +
    '<button type="button" class="message-sheet-cancel">Cancel</button></div>';
  document.body.append(messageSheet);
  let sheetBubble = null, sheetOpenedAt = 0;
  function openMessageSheet(bubble) {
    sheetBubble = bubble;
    sheetOpenedAt = Date.now();
    messageSheet.classList.remove("hidden");
    if (navigator.vibrate) navigator.vibrate(15);
  }
  function closeMessageSheet() {
    sheetBubble = null;
    messageSheet.classList.add("hidden");
  }
  messageSheet.addEventListener("click", event => {
    if (Date.now() - sheetOpenedAt < 300) return; // ignore the tap that ends the long-press
    if (event.target.closest(".message-sheet-delete")) {
      const bubble = sheetBubble;
      closeMessageSheet();
      if (bubble) deleteMessageById(bubble.dataset.messageId, bubble);
    } else if (event.target.closest(".message-sheet-cancel") ||
               event.target.classList.contains("message-sheet-backdrop")) {
      closeMessageSheet();
    }
  });

  let pressTimer = null, pressBubble = null, pressX = 0, pressY = 0;
  function cancelPress() {
    window.clearTimeout(pressTimer);
    pressTimer = null;
    if (pressBubble) pressBubble.classList.remove("is-pressed");
    pressBubble = null;
  }
  messagesEl.addEventListener("touchstart", event => {
    cancelPress();
    if (event.touches.length !== 1) return;
    const bubble = event.target.closest('.message[data-message-id][data-mine="1"]');
    if (!bubble) return;
    pressBubble = bubble;
    pressX = event.touches[0].clientX;
    pressY = event.touches[0].clientY;
    bubble.classList.add("is-pressed");
    pressTimer = window.setTimeout(() => {
      const target = pressBubble;
      cancelPress();
      if (target) openMessageSheet(target);
    }, 450);
  }, { passive: true });
  messagesEl.addEventListener("touchmove", event => {
    if (!pressTimer) return;
    const touch = event.touches[0];
    if (Math.abs(touch.clientX - pressX) > 10 || Math.abs(touch.clientY - pressY) > 10) cancelPress();
  }, { passive: true });
  messagesEl.addEventListener("touchend", cancelPress, { passive: true });
  messagesEl.addEventListener("touchcancel", cancelPress, { passive: true });
  // Stop the browser's own long-press menu on touch devices.
  messagesEl.addEventListener("contextmenu", event => {
    if (window.matchMedia("(pointer: coarse)").matches && event.target.closest(".message")) event.preventDefault();
  });

  async function loadChatMessages(chatId) {
    const messages = $("messages");
    const token = ++state.messagesLoadToken;
    pinnedToBottom = true;
    messages.innerHTML = `<div class="message-system">Loading messages...</div>`;
    try {
      const result = await post(cfg.endpoints.loadMessages, { chatid: chatId }, true);
      // Ignore a late response if another chat was opened/closed meanwhile.
      if (token !== state.messagesLoadToken) return;
      if (!result.ok) {
        messages.innerHTML = `<div class="message-system">Could not load previous messages (HTTP ${result.status}).</div>`;
        console.error("LoadMessages failed:", result.data);
        return;
      }
      const history = Array.isArray(result.data) ? result.data : [];
      messages.innerHTML = "";
      if (!history.length) {
        messages.innerHTML = `<div class="message-system">This is the beginning of your conversation.</div>`;
        return;
      }
      history.map(normalizeMessage)
        .sort((a, b) => new Date(a.SentAt) - new Date(b.SentAt))
        .forEach(message => {
          if (!message.Sender) return;
          const type = message.Sender.toLowerCase() === state.username.toLowerCase()
            ? "outgoing" : "incoming";
          appendMessage(message, type, { scroll: false });
        });
      pinToBottom();
      refreshSenderAvatars();
    } catch (error) {
      if (token !== state.messagesLoadToken) return;
      console.error("Could not load chat messages:", error);
      messages.innerHTML = `<div class="message-system">Could not load messages: ${escapeHtml(error.message)}</div>`;
    }
  }

  const searchInput = $("searchInput");
  searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    const query = searchInput.value.trim();
    if (!query) {
      $("searchResults").innerHTML = `<div class="placeholder-state"><div class="placeholder-icon">⌕</div><strong>Who are you looking for?</strong><span>Search results will show up here.</span></div>`;
      return;
    }
    state.searchTimer = setTimeout(() => searchUsers(query), 300);
  });

  async function searchUsers(target) {
    $("searchResults").innerHTML = `<div class="empty-side">Searching...</div>`;
    try {
      const result = await post(cfg.endpoints.search, { target }, true);
      if (!result.ok) {
        $("searchResults").innerHTML = `<div class="empty-side">${escapeHtml(responseMessage(result.data, `Search failed (HTTP ${result.status}).`))}</div>`;
        return;
      }
      const users = Array.isArray(result.data) ? result.data : [];
      renderSearchResults(users);
    } catch (error) {
      $("searchResults").innerHTML = `<div class="empty-side">Search error: ${escapeHtml(error.message)}</div>`;
    }
  }
  function renderSearchResults(users) {
    const container = $("searchResults");
    container.innerHTML = "";
    if (!users.length) {
      container.innerHTML = `<div class="placeholder-state"><strong>No users found</strong><span>Try another username.</span></div>`;
      return;
    }
    users.forEach(username => {
      const item = document.createElement("div"); item.className = "result-item";
      const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = initials(username);
      const name = document.createElement("div"); name.className = "result-name"; name.textContent = username;
      const add = document.createElement("button"); add.className = "add-btn"; add.type = "button"; add.textContent = "+";
      add.title = "Add friend";
      const alreadyFriend = state.friends.some(f => f.toLowerCase() === String(username).toLowerCase());
      add.disabled = alreadyFriend || String(username).toLowerCase() === state.username.toLowerCase();
      if (alreadyFriend) { add.textContent = "✓"; add.title = "Already added"; }
      add.addEventListener("click", () => addFriend(username, add));
      item.append(avatar, name, add); container.append(item);
    });
  }
  async function addFriend(target, button) {
    button.disabled = true;
    try {
      const result = await post(cfg.endpoints.addToChat, { target }, true);
      if (result.ok) {
        showToast("Friend added.");
        // Refresh both friend data and presence immediately for the caller.
        await Promise.all([
          loadFriends(),
          loadFriendsStatus()
        ]);
        if (searchInput.value.trim()) await searchUsers(searchInput.value.trim());
      } else {
        showToast(responseMessage(result.data, `Could not add friend (HTTP ${result.status}).`));
        button.disabled = false;
      }
    } catch (error) { showToast(`Add friend failed: ${error.message}`); button.disabled = false; }
  }

  async function loadFriends() {
    try {
      const result = await post(cfg.endpoints.loadFriends, undefined, true);
      if (!result.ok) { showToast(responseMessage(result.data, `Could not load friends (HTTP ${result.status}).`)); return; }
      state.friends = Array.isArray(result.data) ? result.data : [];
      renderFriends();
    } catch (error) { showToast(`Could not load friends: ${error.message}`); }
  }
  $("refreshFriends").addEventListener("click", loadFriends);
  function renderFriends() {
    const list = $("friendsList"); list.innerHTML = "";
    if (!state.friends.length) {
      list.innerHTML = `<div class="empty-side">No friends yet. Search for someone to get started.</div>`;
      return;
    }
    state.friends.forEach(username => {
      const button = document.createElement("button"); button.type = "button";
      button.className = "friend-item" + (state.activeFriend === username ? " active" : "");
      const avatar = createAvatar(username, getFriendProfile(username)?.profile);

      const details = document.createElement("span");
      details.className = "friend-details";
      const name = document.createElement("strong"); name.textContent = username;
      const status = document.createElement("small");
      status.className = "friend-status";
      status.textContent = getFriendStatus(username);
      status.classList.toggle("is-online", status.textContent === "Online");
      status.classList.toggle("is-offline", status.textContent !== "Online");
      details.append(name, status);

      button.append(avatar, details);
      button.addEventListener("click", () => openChat(username));
      list.append(button);
    });
  }


  // ================= Groups =================
  // Case-insensitive field lookup, so it works with whatever casing the API returns.
  function pickField(obj, names) {
    if (!obj || typeof obj !== "object") return undefined;
    const keys = new Map(Object.keys(obj).map(key => [key.toLowerCase(), key]));
    for (const name of names) {
      const key = keys.get(name.toLowerCase());
      if (key !== undefined && obj[key] !== null && obj[key] !== undefined && obj[key] !== "") return obj[key];
    }
    return undefined;
  }

  function normalizeGroup(raw) {
    // LoadGroup returns Chat_Member rows (id, chatid, username, isGroup, groupName, picture, isOwner).
    // "id" is only the row's primary key; the chat id is "chatid".
    if (pickField(raw, ["isgroup"]) === false) return null;
    let chatId = Number(pickField(raw, ["chatid", "chat_id", "id"]));
    if (!Number.isInteger(chatId) || chatId <= 0) {
      // Unknown property name: fall back to the first whole-number field whose name contains "id".
      const idKey = raw && typeof raw === "object"
        ? Object.keys(raw).find(key => /id/i.test(key) && Number.isInteger(Number(raw[key])) && Number(raw[key]) > 0)
        : undefined;
      chatId = idKey ? Number(raw[idKey]) : NaN;
    }
    if (!Number.isInteger(chatId) || chatId <= 0) return null;
    const name = pickField(raw, ["groupname", "group_name", "name", "title", "chatname"]);
    const isOwnerRaw = pickField(raw, ["isowner", "is_owner", "owner"]);
    const isOwner = isOwnerRaw === true || String(isOwnerRaw ?? "").trim().toLowerCase() === "true" || Number(isOwnerRaw) === 1;
    const username = pickField(raw, ["username", "userName", "user_name", "name"]) || "";
    return {
      chatId,
      name: name !== undefined ? String(name) : `Group ${chatId}`,
      picture: String(pickField(raw, ["picture", "groupprofile", "profile", "image", "photo"]) ?? ""),
      isOwner,
      ownerUsername: String(username || "")
    };
  }

  function applyGroupPicture(chatId, picture) {
    const id = Number(chatId);
    const source = String(picture ?? "");
    const group = state.groups.find(item => item.chatId === id);
    if (group) group.picture = source;
    if (state.activeGroup && state.activeGroup.chatId === id) {
      state.activeGroup.picture = source;
      const oldAvatar = $("chatAvatar");
      if (oldAvatar) {
        const avatar = createAvatar(state.activeGroup.name, source, "avatar");
        avatar.id = "chatAvatar";
        oldAvatar.replaceWith(avatar);
      }
      if (state.panelMode === "group" && !$("friendProfilePanel").classList.contains("hidden")) {
        renderGroupMembers();
      }
    }
    renderGroups();
  }

  function senderColor(name) {
    let hash = 0;
    for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360} 70% 72%)`;
  }

  // Re-draw sender avatars in the open group when someone's picture changes.
  function refreshSenderAvatars(onlyKey) {
    document.querySelectorAll("#messages .message-sender").forEach(old => {
      const key = old.dataset.user;
      if (onlyKey && key !== onlyKey) return;
      const profile = getFriendProfile(key)?.profile;
      const wanted = profileSource(profile);
      const current = old.querySelector("img")?.src || "";
      if (wanted === current) return;
      const fresh = createAvatar(old.dataset.name || key, profile, "avatar message-sender");
      fresh.dataset.user = key;
      fresh.dataset.name = old.dataset.name || key;
      old.replaceWith(fresh);
    });
  }

  function setSidebarMode(mode) {
    state.sidebarMode = mode === "groups" ? "groups" : "friends";
    const groups = state.sidebarMode === "groups";
    $("friendsSection").classList.toggle("hidden", groups);
    $("groupsSection").classList.toggle("hidden", !groups);
    [["switchFriends", !groups], ["switchGroups", groups]].forEach(([id, active]) => {
      $(id).classList.toggle("active", active);
      $(id).setAttribute("aria-selected", String(active));
    });
  }
  $("switchFriends").addEventListener("click", () => setSidebarMode("friends"));
  $("switchGroups").addEventListener("click", () => setSidebarMode("groups"));

  function setChatHeaderMode(mode) {
    const group = mode === "group";
    $("chatHeaderTag").textContent = group ? "GROUP" : "DIRECT MESSAGE";
    const details = $("chatDetailsButton");
    if (details) {
      details.textContent = group ? "♟" : "⋯";
      details.title = group ? "View group members" : "Contact details";
      details.setAttribute("aria-label", group ? "View group members" : "Contact details");
    }
    $("chatProfileHint").innerHTML = (group ? "Members" : "View profile") + ' <span aria-hidden="true">›</span>';
    $("chatProfileToggle").title = group ? "View group members" : "View contact profile";
    $("chatProfileToggle").setAttribute("aria-label", group ? "Open group members" : "Open contact profile");
  }

  async function loadGroups() {
    try {
      const result = await post(cfg.endpoints.loadGroup, undefined, true);
      if (!result.ok) {
        showToast(responseMessage(result.data, `Could not load groups (HTTP ${result.status}).`));
        return;
      }
      // Accept a plain array or a wrapped one ($values / items / data ...).
      let rawList = result.data;
      if (rawList && !Array.isArray(rawList) && typeof rawList === "object") {
        rawList = ["$values", "values", "items", "data", "result", "groups"]
          .map(key => rawList[key]).find(Array.isArray) || [];
      }
      rawList = Array.isArray(rawList) ? rawList : [];
      console.info("LoadGroup response:", result.data);
      // LoadGroup can return Chat_Member rows. Keep one group per chat id, but
      // prefer the row belonging to the currently logged-in user because IsOwner
      // is a property of that user's Chat_Member row.
      const normalizedGroups = rawList.map(normalizeGroup).filter(Boolean);
      const myUsername = String(state.username || "").toLowerCase();
      const byChat = new Map();
      for (const group of normalizedGroups) {
        const existing = byChat.get(group.chatId);
        const belongsToMe = group.ownerUsername && String(group.ownerUsername).toLowerCase() === myUsername;
        const existingBelongsToMe = existing && existing.ownerUsername && String(existing.ownerUsername).toLowerCase() === myUsername;
        if (!existing || (belongsToMe && !existingBelongsToMe)) byChat.set(group.chatId, group);
      }
      state.groups = [...byChat.values()];
      if (rawList.length && !state.groups.length) {
        console.warn("LoadGroup returned items but none had a readable chat id:", rawList);
        showToast("Groups were returned, but their chat id could not be read. Check the console.");
      }
      renderGroups();
    } catch (error) {
      showToast(`Could not load groups: ${error.message}`);
    }
  }
  $("refreshGroups").addEventListener("click", loadGroups);

  let groupActionMenu = null;
  let groupActionTarget = null;
  let groupLongPressTimer = null;
  let groupLongPressTriggered = false;

  function ensureGroupActionMenu() {
    if (groupActionMenu) return groupActionMenu;
    const menu = document.createElement("div");
    menu.className = "group-action-menu hidden";
    menu.setAttribute("role", "menu");
    menu.innerHTML = `<button type="button" class="group-delete-action" role="menuitem">Delete group</button>`;
    menu.querySelector(".group-delete-action").addEventListener("click", async event => {
      event.stopPropagation();
      const group = groupActionTarget;
      hideGroupActionMenu();
      if (group) await deleteGroup(group);
    });
    document.body.append(menu);
    groupActionMenu = menu;
    document.addEventListener("pointerdown", event => {
      if (groupActionMenu && !groupActionMenu.classList.contains("hidden") && !groupActionMenu.contains(event.target)) {
        hideGroupActionMenu();
      }
    });
    window.addEventListener("resize", hideGroupActionMenu);
    window.addEventListener("scroll", hideGroupActionMenu, true);
    return menu;
  }

  function hideGroupActionMenu() {
    if (!groupActionMenu) return;
    groupActionMenu.classList.add("hidden");
    groupActionTarget = null;
  }

  function showGroupActionMenu(group, x, y) {
    if (!group?.isOwner) return;
    const menu = ensureGroupActionMenu();
    groupActionTarget = group;
    menu.classList.remove("hidden");
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(8, x), window.innerWidth - rect.width - 8);
    const top = Math.min(Math.max(8, y), window.innerHeight - rect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function attachGroupDeleteGestures(button, group) {
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      showGroupActionMenu(group, event.clientX, event.clientY);
    });

    button.addEventListener("pointerdown", event => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      groupLongPressTriggered = false;
      clearTimeout(groupLongPressTimer);
      groupLongPressTimer = setTimeout(() => {
        groupLongPressTriggered = true;
        showGroupActionMenu(group, event.clientX || window.innerWidth / 2, event.clientY || window.innerHeight / 2);
      }, 550);
    }, { passive: true });

    const cancelLongPress = () => clearTimeout(groupLongPressTimer);
    button.addEventListener("pointerup", cancelLongPress);
    button.addEventListener("pointercancel", cancelLongPress);
    button.addEventListener("pointermove", cancelLongPress);

    button.addEventListener("click", event => {
      if (groupLongPressTriggered) {
        event.preventDefault();
        event.stopImmediatePropagation();
        groupLongPressTriggered = false;
      }
    }, true);
  }

  function showGroupDeleteDialog(groupName) {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.className = "cropper-overlay group-delete-overlay";
      overlay.innerHTML = `
        <div class="group-delete-dialog" role="dialog" aria-modal="true" aria-label="Delete group">
          <div class="group-delete-icon">⌫</div>
          <div class="group-delete-copy">
            <div class="eyebrow">DANGER ZONE</div>
            <h3>Delete “${escapeHtml(groupName)}”?</h3>
            <p>This will remove the group from your chats. This action cannot be undone.</p>
          </div>
          <div class="group-delete-actions">
            <button type="button" class="secondary-btn group-delete-cancel">Keep group</button>
            <button type="button" class="group-delete-confirm">Delete group</button>
          </div>
        </div>`;
      document.body.append(overlay);
      const close = value => { document.removeEventListener("keydown", onKey); overlay.remove(); resolve(value); };
      const onKey = event => { if (event.key === "Escape") close(false); };
      overlay.querySelector(".group-delete-cancel").onclick = () => close(false);
      overlay.querySelector(".group-delete-confirm").onclick = () => close(true);
      overlay.addEventListener("click", event => { if (event.target === overlay) close(false); });
      document.addEventListener("keydown", onKey);
      requestAnimationFrame(() => overlay.querySelector(".group-delete-cancel")?.focus());
    });
  }

  async function deleteGroup(group) {
    if (!group?.isOwner) {
      showToast("Only the group owner can delete this group.");
      return;
    }
    const confirmed = await showGroupDeleteDialog(group.name);
    if (!confirmed) return;

    try {
      // The owner can delete directly from the sidebar without opening the group.
      // Therefore capture the member IDs/usernames BEFORE the API removes the group.
      let memberRows = [];
      if (state.activeGroup?.chatId === group.chatId && Array.isArray(state.groupMembers) && state.groupMembers.length) {
        memberRows = state.groupMembers;
      } else {
        const membersResult = await post(cfg.endpoints.getGroupMembers, { chatid: group.chatId }, true);
        if (membersResult.ok) {
          memberRows = Array.isArray(membersResult.data) ? membersResult.data : [];
        } else {
          showToast(responseMessage(membersResult.data, `Could not load group members (HTTP ${membersResult.status}).`));
          return;
        }
      }

      // The deleting user handles their own UI locally. Do not include them in
      // the SignalR recipient list, otherwise ReceiveDeleteGroup would also
      // show the deletion notification to the person who performed the delete.
      const currentUsername = String(state.username || "").trim().toLowerCase();
      const members = [...new Set(memberRows
        .map(member => String(readUserField(member, "username", "Username", "userName", "name") || member.username || "").trim())
        .filter(Boolean)
        .filter(name => !currentUsername || name.toLowerCase() !== currentUsername))];

      const result = await post(cfg.endpoints.deleteGroup, { chatid: group.chatId }, true);
      if (!result.ok) {
        showToast(responseMessage(result.data, `Could not delete the group (HTTP ${result.status}).`));
        return;
      }

      console.info("Invoking GroupHub.DeleteGroup:", { chatId: group.chatId, members });
      if (members.length && state.groupHub && state.groupHubReady && await state.groupHubReady &&
          state.groupHub.state === signalR.HubConnectionState.Connected) {
        await state.groupHub.invoke("DeleteGroup", members, Number(group.chatId));
      } else if (members.length) {
        console.warn("GroupHub is not connected; other members will not receive ReceiveDeleteGroup.");
        showToast("Group deleted, but live notification could not be sent.");
      }

      const wasActive = state.activeGroup?.chatId === group.chatId;
      state.groups = state.groups.filter(item => item.chatId !== group.chatId);
      if (wasActive) {
        await closeChatInternal();
      } else {
        renderGroups();
      }
      showToast("Group deleted.");
    } catch (error) {
      console.error("DeleteGroup failed:", error);
      showToast(`Could not delete the group: ${error.message}`);
    }
  }

  function renderGroups() {
    const list = $("groupsList");
    list.innerHTML = "";
    if (!state.groups.length) {
      list.innerHTML = `<div class="empty-side">No groups yet. Tap + to create one.</div>`;
      return;
    }
    state.groups.forEach(group => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "friend-item" + (state.activeGroup && state.activeGroup.chatId === group.chatId ? " active" : "");
      const avatar = createAvatar(group.name, group.picture);
      const details = document.createElement("span");
      details.className = "friend-details";
      const name = document.createElement("strong");
      name.textContent = group.name;
      const sub = document.createElement("small");
      sub.className = "friend-status";
      sub.textContent = "Group";
      details.append(name, sub);
      button.append(avatar, details);
      button.addEventListener("click", () => openGroup(group));
      if (group.isOwner) attachGroupDeleteGestures(button, group);
      list.append(button);
    });
  }

  // Leave every SignalR room we are currently in (friend chat and/or group).
  async function leaveActiveChats() {
    for (const key of ["activeChatId", "groupChatId"]) {
      if (state[key] !== null) {
        await state.hub.invoke("LeaveChat", state[key]);
        state[key] = null;
      }
    }
  }

  function openGroup(group) {
    state.chatSwitchQueue = state.chatSwitchQueue
      .then(() => openGroupInternal(group))
      .catch(error => {
        console.error("Could not open group:", error);
        showToast("Could not open this group.");
      });
    return state.chatSwitchQueue;
  }

  async function openGroupInternal(group) {
    if (state.activeGroup && state.activeGroup.chatId === group.chatId && state.groupChatId !== null) return;

    closeFriendProfileNow();
    state.messagesLoadToken += 1;
    $("chatEmpty").classList.add("hidden");
    $("chatActive").classList.remove("hidden");
    mainView.classList.add("chat-open");
    state.activeFriend = null;
    state.activeGroup = group;     // the group's chat id is kept in GroupChatId, never in ChatId
    state.groupMembers = [];
    setChatHeaderMode("group");
    $("chatName").textContent = group.name;
    const oldAvatar = $("chatAvatar");
    const newAvatar = createAvatar(group.name, group.picture, "avatar");
    newAvatar.id = "chatAvatar";
    oldAvatar.replaceWith(newAvatar);
    const statusElement = $("chatStatus");
    statusElement.textContent = "Group";
    statusElement.classList.remove("is-online", "is-offline");
    $("messages").innerHTML = `<div class="message-system">Opening ${escapeHtml(group.name)}...</div>`;
    renderFriends();
    renderGroups();

    if (!state.hub || !state.hubReady || !(await state.hubReady)) {
      $("messages").innerHTML = `<div class="message-system">SignalR is not connected. Please try again.</div>`;
      return;
    }
    if (state.hub.state !== signalR.HubConnectionState.Connected) {
      $("messages").innerHTML = `<div class="message-system">SignalR is reconnecting. Please try again in a moment.</div>`;
      return;
    }

    try {
      await leaveActiveChats();
    } catch (error) {
      console.error("LeaveChat failed:", error);
      $("messages").innerHTML = `<div class="message-system">Could not leave the previous conversation. Please try again.</div>`;
      return;
    }

    try {
      // JoinChat(targetUsername = "", Groupchatid): the username stays empty for groups.
      // It returns 0 in that case, which we do not need.
      await state.hub.invoke("JoinChat", "", group.chatId);
      state.groupChatId = group.chatId;
      renderGroups();
      loadGroupMembers(group.chatId);            // runs alongside the message history
      await loadChatMessages(group.chatId);
      if (!window.matchMedia("(pointer: coarse)").matches) $("messageInput").focus();
    } catch (error) {
      state.groupChatId = null;
      console.error("JoinChat (group) failed:", error);
      $("messages").innerHTML = `<div class="message-system">Could not join this group: ${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadGroupMembers(chatId) {
    try {
      const result = await post(cfg.endpoints.getGroupMembers, { chatid: chatId }, true);
      if (state.groupChatId !== chatId) return;  // the user already moved to another chat
      if (!result.ok) {
        showToast(responseMessage(result.data, `Could not load group members (HTTP ${result.status}).`));
        return;
      }
      const users = Array.isArray(result.data) ? result.data : [];

      // GetGroupMembers returns Chat_Member records. In this model, `picture`
      // is the GROUP picture shared by every row, not the member's avatar.
      // Read it once for the group and never store it as a user's profile.
      const groupPicture = users.length
        ? readUserField(users[0], "picture", "Picture")
        : "";
      if (groupPicture) applyGroupPicture(chatId, groupPicture);

      state.groupMembers = users.map(user => {
        const username = readUserField(user, "username", "Username", "userName", "name");
        if (!username) return null;
        rememberUser({
          username,
          status: readUserField(user, "status", "Status"),
          // Only use an explicitly user-specific profile field here.
          // Chat_Member.picture belongs to the group and must not be used.
          profile: readUserField(user, "userProfile", "UserProfile", "profile", "Profile"),
          description: readUserField(user, "description", "Description")
        });
        return { username: String(username) };
      }).filter(Boolean);

      const count = state.groupMembers.length;
      $("chatStatus").textContent = `${count} member${count === 1 ? "" : "s"}`;
      refreshSenderAvatars();
      if (state.panelMode === "group" && !$("friendProfilePanel").classList.contains("hidden")) {
        renderGroupMembers();
      } else if (window.matchMedia("(min-width: 901px)").matches && state.panelMode === null) {
        openGroupPanel();   // desktop: show the member list on the right straight away
      }
    } catch (error) {
      console.error("Could not load group members:", error);
      showToast("Could not load group members.");
    }
  }

  async function addGroupMember() {
    const group = state.activeGroup;
    if (!group?.isOwner) {
      showToast("Only the group owner can add members.");
      return;
    }
    if (state.groupChatId === null || state.groupChatId !== group.chatId) {
      showToast("Open the group before adding a member.");
      return;
    }
    if (state.groupMembers.length >= 10) {
      showToast("This group already has 10 members.");
      return;
    }

    await loadFriends();

    const existing = new Set(
      state.groupMembers
        .map(member => String(member?.username ?? member?.Username ?? member ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    const candidates = state.friends
      .map(friend => String(friend?.username ?? friend?.Username ?? friend ?? "").trim())
      .filter(Boolean)
      .filter((username, index, all) => all.findIndex(x => x.toLowerCase() === username.toLowerCase()) === index)
      .filter(username => username.toLowerCase() !== String(state.username).toLowerCase())
      .filter(username => !existing.has(username.toLowerCase()));

    if (!candidates.length) {
      showToast(state.friends.length
        ? "All of your friends are already members of this group."
        : "You have no friends to add to this group.");
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "cropper-overlay add-member-overlay";
    overlay.innerHTML =
      '<div class="cropper-dialog add-member-dialog" role="dialog" aria-modal="true" aria-label="Add member">' +
        '<div class="add-member-head">' +
          '<div><h3>Add member</h3><p>Select one friend to add to <strong class="add-member-group-name"></strong>.</p></div>' +
          '<button type="button" class="add-member-close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="add-member-search-wrap"><span class="add-member-search-icon">⌕</span><input class="add-member-search" type="search" placeholder="Search friends..." autocomplete="off" spellcheck="false"></div>' +
        '<div class="add-member-list" role="radiogroup" aria-label="Friends"></div>' +
        '<div class="add-member-empty hidden">No matching friends.</div>' +
        '<div class="add-member-footer"><span class="add-member-selected">No friend selected</span><div class="cropper-actions"><button type="button" class="secondary-btn add-member-cancel">Cancel</button><button type="button" class="primary-btn add-member-submit" disabled>Add member</button></div></div>' +
      '</div>';
    document.body.append(overlay);

    const dialog = overlay.querySelector(".add-member-dialog");
    const list = overlay.querySelector(".add-member-list");
    const search = overlay.querySelector(".add-member-search");
    const empty = overlay.querySelector(".add-member-empty");
    const selectedLabel = overlay.querySelector(".add-member-selected");
    const submit = overlay.querySelector(".add-member-submit");
    overlay.querySelector(".add-member-group-name").textContent = group.name;

    let selected = null;
    let busy = false;

    function render(filter = "") {
      const query = filter.trim().toLowerCase();
      list.innerHTML = "";
      const visible = candidates.filter(username => !query || username.toLowerCase().includes(query));
      empty.classList.toggle("hidden", visible.length > 0);

      visible.forEach(username => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "add-member-row" + (selected?.toLowerCase() === username.toLowerCase() ? " selected" : "");
        row.setAttribute("role", "radio");
        row.setAttribute("aria-checked", String(selected?.toLowerCase() === username.toLowerCase()));

        const avatar = createAvatar(username, getFriendProfile(username)?.profile, "avatar");
        avatar.classList.add("add-member-avatar");
        const details = document.createElement("span");
        details.className = "add-member-details";
        const name = document.createElement("strong");
        name.textContent = username;
        const hint = document.createElement("small");
        hint.textContent = "Friend";
        details.append(name, hint);
        const check = document.createElement("span");
        check.className = "add-member-check";
        check.textContent = "✓";
        row.append(avatar, details, check);

        row.addEventListener("click", () => {
          selected = username;
          render(search.value);
          selectedLabel.textContent = `${username} selected`;
          submit.disabled = false;
        });
        list.append(row);
      });
    }

    function close() {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }
    function onKey(event) {
      if (event.key === "Escape" && !busy) close();
    }

    search.addEventListener("input", () => render(search.value));
    overlay.querySelector(".add-member-close").addEventListener("click", close);
    overlay.querySelector(".add-member-cancel").addEventListener("click", close);
    submit.addEventListener("click", async () => {
      if (!selected || busy) return;
      busy = true;
      submit.disabled = true;
      submit.textContent = "Adding…";
      try {
        const result = await post(cfg.endpoints.addMember, {
          chatid: group.chatId,
          target: selected
        }, true);
        if (!result.ok) {
          showToast(responseMessage(result.data, `Could not add member (HTTP ${result.status}).`));
          submit.disabled = false;
          submit.textContent = "Add member";
          busy = false;
          return;
        }
        close();
        await loadGroupMembers(group.chatId);
        showToast(`${selected} was added to the group.`);
      } catch (error) {
        console.error("AddMember failed:", error);
        showToast(`Could not add member: ${error.message}`);
        submit.disabled = false;
        submit.textContent = "Add member";
        busy = false;
      }
    });

    document.addEventListener("keydown", onKey);
    render();
    requestAnimationFrame(() => search.focus());
  }

  async function removeGroupMember(target) {
    const group = state.activeGroup;
    if (!group?.isOwner) {
      showToast("Only the group owner can remove members.");
      return;
    }
    const username = String(target || "").trim();
    if (!username) return;
    if (username.toLowerCase() === String(state.username).toLowerCase()) {
      showToast("You cannot remove yourself from the group.");
      return;
    }

    const confirmed = window.confirm(`Remove ${username} from this group?`);
    if (!confirmed) return;

    try {
      const result = await post(cfg.endpoints.removeMember, {
        chatid: group.chatId,
        target: username
      }, true);
      if (!result.ok) {
        showToast(responseMessage(result.data, `Could not remove member (HTTP ${result.status}).`));
        return;
      }

      // The server sends ReceiveRemoveMember only to the removed user.
      // Refresh the owner's member list locally after a successful 200 response.
      await loadGroupMembers(group.chatId);
      showToast(`${username} was removed from the group.`);
    } catch (error) {
      console.error("RemoveMember failed:", error);
      showToast(`Could not remove member: ${error.message}`);
    }
  }

  function renderGroupMembers() {
    const content = $("friendProfileContent");
    if (!content) return;
    const group = state.activeGroup;
    $("profilePanelEyebrow").textContent = "GROUP";
    $("profilePanelTitle").textContent = "Group details";
    content.innerHTML = "";
    if (!group) return;

    const hero = document.createElement("section");
    hero.className = "group-profile-hero";
    const avatar = createAvatar(group.name, group.picture, "group-profile-avatar");
    const title = document.createElement("strong");
    title.textContent = group.name;
    const subtitle = document.createElement("small");
    subtitle.textContent = `${state.groupMembers.length} member${state.groupMembers.length === 1 ? "" : "s"}`;
    hero.append(avatar, title, subtitle);
    content.append(hero);

    const actions = document.createElement("div");
    actions.className = "group-profile-actions";
    if (group.isOwner) {
      const file = document.createElement("input");
      file.type = "file"; file.accept = "image/jpeg,image/png,image/webp"; file.className = "hidden";
      const change = document.createElement("button");
      change.type = "button"; change.className = "secondary-btn group-picture-change"; change.textContent = "Change picture";
      change.onclick = () => file.click();
      file.onchange = () => handleGroupPictureSelection(file);
      actions.append(change, file);
      if (state.groupMembers.length < 10) {
        const add = document.createElement("button");
        add.type = "button"; add.className = "primary-btn group-member-add"; add.innerHTML = '<span>＋</span> Add member';
        add.onclick = addGroupMember;
        actions.append(add);
      }
    }
    if (actions.children.length) content.append(actions);

    const head = document.createElement("div");
    head.className = "group-members-head";
    head.innerHTML = `<span class="group-members-title">Members</span><span class="group-member-count">${state.groupMembers.length}/10</span>`;
    content.append(head);

    if (!state.groupMembers.length) {
      const loading = document.createElement("div");
      loading.className = "profile-loading";
      loading.textContent = "Loading members…";
      content.append(loading);
    } else {
      const list = document.createElement("div");
      list.className = "group-members";
      state.groupMembers.forEach(member => {
        const isMe = member.username.toLowerCase() === String(state.username).toLowerCase();
        const profile = getFriendProfile(member.username);
        const status = isMe ? "Online" : (profile?.status || "Offline");
        const row = document.createElement("div");
        row.className = "member-item";
        const memberButton = document.createElement("button");
        memberButton.type = "button";
        memberButton.className = "member-main";
        const memberAvatar = createAvatar(member.username, profile?.profile, "avatar");
        const details = document.createElement("span"); details.className = "friend-details";
        const name = document.createElement("strong"); name.textContent = member.username;
        const small = document.createElement("small"); small.className = "friend-status"; small.textContent = isMe ? "You" : status;
        small.classList.toggle("is-online", status === "Online"); small.classList.toggle("is-offline", status !== "Online");
        details.append(name, small); memberButton.append(memberAvatar, details);
        if (!isMe) memberButton.onclick = () => loadFriendProfile(member.username);
        row.append(memberButton);
        if (group.isOwner && !isMe) {
          const remove = document.createElement("button");
          remove.type = "button"; remove.className = "member-remove-btn";
          remove.innerHTML = '<span>×</span><span>Remove</span>';
          remove.title = `Remove ${member.username}`;
          remove.onclick = e => { e.stopPropagation(); removeGroupMember(member.username); };
          row.append(remove);
        }
        list.append(row);
      });
      content.append(list);
    }

    if (group.isOwner) {
      const danger = document.createElement("div");
      danger.className = "group-danger-zone";
      danger.innerHTML = '<div><strong>Delete this group</strong><small>Remove the group for everyone.</small></div>';
      const deleteButton = document.createElement("button");
      deleteButton.type = "button"; deleteButton.className = "group-delete-button";
      deleteButton.innerHTML = '<span>⌫</span> Delete group';
      deleteButton.onclick = () => deleteGroup(group);
      danger.append(deleteButton);
      content.append(danger);
    }
  }

  async function handleGroupPictureSelection(input) {
    const file = input.files?.[0] || null;
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.");
      return;
    }
    if (!state.activeGroup || state.groupChatId === null || state.groupChatId !== state.activeGroup.chatId) {
      showToast("Open a group before changing its picture.");
      return;
    }
    try {
      const cropped = await openAvatarCropper(file);
      if (!cropped) return;
      await saveGroupPicture(cropped, state.activeGroup.chatId);
    } catch (error) {
      console.error("Could not change group picture:", error);
      showToast(error.message || "Could not change the group picture.");
    }
  }

  async function saveGroupPicture(file, chatId) {
    const group = state.groups.find(item => item.chatId === chatId) || state.activeGroup;
    const button = $("friendProfileContent")?.querySelector(".group-picture-change");
    if (!group) {
      showToast("Open a group before changing its picture.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Maximum image size is 5MB.");
      return;
    }
    if (button) { button.disabled = true; button.textContent = "Uploading..."; }
    try {
      const formData = new FormData();
      formData.append("Picture", file);
      const requestUrl = new URL(url(cfg.endpoints.changeGroupProfile));
      requestUrl.searchParams.set("chatid", String(chatId));
      const response = await fetch(requestUrl.toString(), {
        method: "POST",
        headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
        body: formData
      });
      const data = await readResponse(response);
      if (!response.ok) {
        throw new Error(responseMessage(data, `Group picture upload failed (HTTP ${response.status}).`));
      }

      // Prefer the server-returned path when available. Otherwise keep the local
      // cropped preview so the UI changes immediately.
      const returnedPicture = typeof data === "string"
        ? data
        : (data?.picture ?? data?.Picture ?? data?.profile ?? data?.Profile ?? data?.url ?? "");
      const localPicture = profileSource(returnedPicture) || URL.createObjectURL(file);
      applyGroupPicture(chatId, localPicture);

      // Refresh membership before broadcasting so a newly-added member also gets
      // the picture update. If the hub is temporarily unavailable, the saved API
      // change still remains valid and LoadGroup will restore it later.
      await loadGroupMembers(chatId);
      if (state.groupHub && state.groupHubReady && (await state.groupHubReady) &&
          state.groupHub.state === signalR.HubConnectionState.Connected) {
        const members = state.groupMembers.map(member => member.username).filter(Boolean);
        if (members.length) {
          await state.groupHub.invoke("ChangeProfile", members, chatId);
        }
      }
      showToast("Group picture updated.");
    } finally {
      const currentButton = $("friendProfileContent")?.querySelector(".group-picture-change");
      if (currentButton) { currentButton.disabled = false; currentButton.textContent = "Change"; }
    }
  }

  async function openGroupPanel() {
    if (!state.activeGroup) return;
    const panel = $("friendProfilePanel");
    window.clearTimeout(profileCloseTimer);
    state.panelMode = "group";
    panel.classList.remove("hidden");
    panel.setAttribute("aria-label", `Members of ${state.activeGroup.name}`);
    // Render immediately so a touch tap never appears to do nothing.
    renderGroupMembers();
    requestAnimationFrame(() => panel.classList.add("is-open"));
    // Always refresh the members when the group profile is opened. Membership can
    // change while this group is already open, so never rely on the cached list.
    if (state.groupChatId !== null && state.groupChatId === state.activeGroup.chatId) {
      await loadGroupMembers(state.activeGroup.chatId);
    }
  }

  // ---- Create group dialog ----
  const MAX_GROUP_FRIENDS = 9; // creator is the 10th member
  function openCreateGroupDialog() {
    if (!state.friends.length) { showToast("Add some friends first, then create a group."); return; }
    const overlay = document.createElement("div");
    overlay.className = "cropper-overlay";
    overlay.innerHTML = `
      <div class="cropper-dialog group-dialog" role="dialog" aria-modal="true" aria-label="Create a group">
        <div class="group-create-head"><h3>Create a group</h3><p>Give it a name, then choose the friends you want in it.</p></div>
        <div class="group-create-body">
          <div class="group-name-wrap"><span class="group-name-label">Group name</span><input class="group-name-input" type="text" maxlength="40" placeholder="e.g. Weekend Crew" autocomplete="off"></div>
          <div class="group-selected"></div>
          <div class="group-friend-search"><span>⌕</span><input class="group-search-input" type="search" placeholder="Search friends..." autocomplete="off"></div>
          <div class="group-friend-list"></div><div class="group-empty hidden">No matching friends.</div>
        </div>
        <div class="group-create-footer"><span class="group-counter">0 / ${MAX_GROUP_FRIENDS} selected</span><div class="cropper-actions"><button type="button" class="secondary-btn group-cancel">Cancel</button><button type="button" class="primary-btn group-create" disabled>Create group</button></div></div>
      </div>`;
    document.body.append(overlay);
    const nameInput=overlay.querySelector('.group-name-input'), search=overlay.querySelector('.group-search-input'), list=overlay.querySelector('.group-friend-list'), chips=overlay.querySelector('.group-selected'), counter=overlay.querySelector('.group-counter'), create=overlay.querySelector('.group-create'), empty=overlay.querySelector('.group-empty');
    const selected=new Set(); let busy=false;
    const friends=[...new Set(state.friends.map(String))];
    function sync(){
      counter.textContent=`${selected.size} / ${MAX_GROUP_FRIENDS} selected`;
      chips.innerHTML='';
      selected.forEach(username=>{const chip=document.createElement('span');chip.className='selected-chip';chip.innerHTML=`<span>${escapeHtml(username)}</span>`;const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label',`Remove ${username}`);x.onclick=()=>{selected.delete(username);render(search.value);sync();};chip.append(x);chips.append(chip);});
      create.disabled=!nameInput.value.trim()||selected.size===0;
    }
    function render(filter=''){
      list.innerHTML=''; const q=filter.trim().toLowerCase(); const visible=friends.filter(u=>!q||u.toLowerCase().includes(q)); empty.classList.toggle('hidden',visible.length>0);
      visible.forEach(username=>{const row=document.createElement('button');row.type='button';row.className='group-friend-row'+(selected.has(username)?' is-selected':'');
        const avatar=createAvatar(username,getFriendProfile(username)?.profile); avatar.classList.add('avatar'); const name=document.createElement('span');name.className='group-friend-name';name.textContent=username; const check=document.createElement('span');check.className='group-friend-check';check.textContent='✓'; row.append(avatar,name,check);
        row.onclick=()=>{if(selected.has(username)) selected.delete(username); else {if(selected.size>=MAX_GROUP_FRIENDS){showToast(`A group can have up to ${MAX_GROUP_FRIENDS} friends plus you.`);return;} selected.add(username);} render(search.value);sync();}; list.append(row); });
    }
    function close(){document.removeEventListener('keydown',onKey);overlay.remove();} function onKey(e){if(e.key==='Escape'&&!busy)close();}
    nameInput.addEventListener('input',sync); search.addEventListener('input',()=>render(search.value)); overlay.querySelector('.group-cancel').onclick=close; document.addEventListener('keydown',onKey);
    create.onclick=async()=>{if(busy)return;const groupName=nameInput.value.trim();if(!groupName||!selected.size)return;busy=true;create.disabled=true;create.textContent='Creating…';try{const result=await post(cfg.endpoints.createGroup,{members:[...selected],GroupName:groupName},true);if(!result.ok)throw new Error(responseMessage(result.data,`Could not create the group (HTTP ${result.status}).`));close();await loadGroups();const created=state.groups.find(g=>g.name.trim().toLowerCase()===groupName.toLowerCase());if(created)await openGroup(created);showToast(`Group “${groupName}” created.`);}catch(error){console.error('CreateGroup failed:',error);showToast(error.message||'Could not create the group.');busy=false;create.disabled=false;create.textContent='Create group';}};
    render(); sync(); requestAnimationFrame(()=>nameInput.focus());
  }
  $("newGroupButton").addEventListener("click", openCreateGroupDialog);

  function openChat(target) {
    // Serialize rapid friend clicks so each old chat is left before the next is joined.
    state.chatSwitchQueue = state.chatSwitchQueue
      .then(() => openChatInternal(target))
      .catch(error => {
        console.error("Could not switch chat:", error);
        showToast("Could not open this conversation.");
      });
    return state.chatSwitchQueue;
  }

  async function openChatInternal(target) {
    // Clicking a friend in the list only opens the chat.
    // The profile panel opens only from the chat header (chatProfileToggle).
    if (state.activeFriend === target && state.activeChatId !== null) return;

    closeFriendProfileNow();
    state.messagesLoadToken += 1;
    $("chatEmpty").classList.add("hidden");
    $("chatActive").classList.remove("hidden");
    mainView.classList.add("chat-open");
    state.activeGroup = null;
    state.groupMembers = [];
    setChatHeaderMode("friend");
    renderGroups();
    $("chatName").textContent = target;
    const oldAvatar = $("chatAvatar");
    const newAvatar = createAvatar(target, getFriendProfile(target)?.profile, "avatar");
    newAvatar.id = "chatAvatar";
    oldAvatar.replaceWith(newAvatar);
    renderActiveFriendStatus();
    $("messages").innerHTML = `<div class="message-system">Opening conversation with ${escapeHtml(target)}...</div>`;

    if (!state.hub || !state.hubReady || !(await state.hubReady)) {
      $("messages").innerHTML = `<div class="message-system">SignalR is not connected. Please try again.</div>`;
      return;
    }
    if (state.hub.state !== signalR.HubConnectionState.Connected) {
      $("messages").innerHTML = `<div class="message-system">SignalR is reconnecting. Please try again in a moment.</div>`;
      return;
    }

    // Leave the previous conversation before joining the newly selected friend.
    if (state.activeChatId !== null || state.groupChatId !== null) {
      try {
        await leaveActiveChats();
      } catch (error) {
        console.error("LeaveChat failed:", error);
        $("messages").innerHTML = `<div class="message-system">Could not leave the previous conversation. Please try again.</div>`;
        return;
      }
    }

    state.activeFriend = target;
    renderFriends();

    try {
      // JoinChat(targetUsername) returns the ChatId created/found by the hub.
      const chatId = await state.hub.invoke("JoinChat", target, 0);
      if (!Number.isInteger(chatId) || chatId <= 0) {
        throw new Error("JoinChat did not return a valid chat ID.");
      }

      state.activeChatId = chatId;
      await loadChatMessages(chatId);
      // Do not auto-focus on touch devices: it pops the keyboard and shrinks the chat.
      if (!window.matchMedia("(pointer: coarse)").matches) $("messageInput").focus();
    } catch (error) {
      state.activeChatId = null;
      console.error("JoinChat failed:", error);
      $("messages").innerHTML = `<div class="message-system">Could not join this conversation: ${escapeHtml(error.message)}</div>`;
    }
  }

  async function closeChatInternal() {
    state.messagesLoadToken += 1;
    closeFriendProfileNow();
    const previousIds = [state.activeChatId, state.groupChatId].filter(id => id !== null);
    state.activeFriend = null;
    state.activeChatId = null;
    state.activeGroup = null;
    state.groupChatId = null;
    state.groupMembers = [];
    $("chatActive").classList.add("hidden");
    $("chatEmpty").classList.remove("hidden");
    mainView.classList.remove("chat-open");
    renderFriends();
    renderGroups();
    if (state.hub && state.hub.state === signalR.HubConnectionState.Connected) {
      for (const id of previousIds) {
        try { await state.hub.invoke("LeaveChat", id); }
        catch (error) { console.error("LeaveChat failed:", error); }
      }
    }
  }
  $("chatBackButton").addEventListener("click", () => {
    state.chatSwitchQueue = state.chatSwitchQueue.then(closeChatInternal).catch(error => console.error(error));
  });

  const messageFileInput = $("messageFile");
  const attachmentPreview = $("attachmentPreview");
  const attachmentName = $("attachmentName");

  $("attachFileButton").addEventListener("click", () => messageFileInput.click());
  messageFileInput.addEventListener("change", () => {
    const file = messageFileInput.files?.[0] || null;
    state.selectedChatFile = file;
    if (file) {
      attachmentName.textContent = `${file.name} · ${formatFileSize(file.size)}`;
      attachmentPreview.classList.remove("hidden");
    } else {
      attachmentPreview.classList.add("hidden");
      attachmentName.textContent = "";
    }
  });
  $("removeAttachment").addEventListener("click", () => {
    state.selectedChatFile = null;
    messageFileInput.value = "";
    attachmentPreview.classList.add("hidden");
    attachmentName.textContent = "";
  });

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  // Read the file as Base64. ASP.NET SignalR's JSON protocol binds a C# byte[]
  // from a Base64 JSON string, so send the filename and Base64 data separately.
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const comma = dataUrl.indexOf(",");
        if (comma < 0) return reject(new Error("Could not read the selected file."));
        resolve(dataUrl.slice(comma + 1));
      };
      reader.onerror = () => reject(new Error("Could not read the selected file."));
      reader.readAsDataURL(file);
    });
  }

  $("messageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("messageInput"), content = input.value.trim();
    const file = state.selectedChatFile;
    if (!content && !file) return;
    if (!state.hub || state.hub.state !== signalR.HubConnectionState.Connected) {
      showToast("Chat hub is not connected yet."); return;
    }
    if (currentChatId() === null) {
      showToast("Open a conversation before sending a message."); return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      showToast("Maximum attachment size is 10 MB."); return;
    }
    const sendButton = $("messageForm").querySelector('button[type="submit"]');
    sendButton.disabled = true;
    try {
      // Match the Hub signature:
      // SendMessage(string content, int chatid, string target,
      //             string fileName = null, byte[] File = null)
      // SignalR's JSON protocol represents byte[] as a Base64 string.
      const fileBase64 = file ? await fileToBase64(file) : null;
      await state.hub.invoke(
        "SendMessage",
        content,
        Number(currentChatId()),
        state.activeGroup ? "" : state.activeFriend,   // target is empty for groups
        file ? file.name : null,
        fileBase64
      );
      input.value = "";
      state.selectedChatFile = null;
      messageFileInput.value = "";
      attachmentPreview.classList.add("hidden");
      attachmentName.textContent = "";
    } catch (error) {
      console.error("SendMessage failed:", error);
      showToast(error.message || "Message could not be sent.");
    } finally {
      sendButton.disabled = false;
    }
  });

  // Settings are a separate view inside the workspace; edits stay local until Save.
  $("settingsNav").addEventListener("click", () => {
    $("contentGrid").classList.add("hidden");
    $("settingsView").classList.remove("hidden");
    mainView.classList.add("settings-open");
    mainView.classList.remove("chat-open");
    closeFriendProfileNow();
    $("descriptionInput").value = String(readUserField(state.selfProfile, "description", "Description") || "");
    $("profileFile").value = "";
    state.selectedProfileFile = null;
    $("settingsMessage").textContent = "";
    const preview = $("profilePreview");
    preview.innerHTML = "";
    preview.textContent = initials(state.username);
    if (state.currentProfileUrl) {
      const image = document.createElement("img");
      image.src = state.currentProfileUrl;
      image.alt = "Profile preview";
      image.onerror = () => { image.remove(); preview.textContent = initials(state.username); };
      preview.append(image);
    }
  });

  $("backToChats").addEventListener("click", () => {
    $("settingsView").classList.add("hidden");
    $("contentGrid").classList.remove("hidden");
    mainView.classList.remove("settings-open");
  });

  // ---- Profile photo cropper (circular mask) ----
  const CROP_OUTPUT_SIZE = 512;   // final avatar is always 512x512, however big the original is
  const CROP_MAX_ZOOM = 4;        // up to 4x beyond "fit"

  function openAvatarCropper(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image could not be loaded.")); };
      img.onload = () => {
        const overlay = document.createElement("div");
        overlay.className = "cropper-overlay";
        overlay.innerHTML =
          '<div class="cropper-dialog" role="dialog" aria-modal="true" aria-label="Adjust profile photo">' +
          '<h3>Adjust your photo</h3>' +
          '<p>Drag to move. Zoom with the slider, mouse wheel or pinch. Only the circle will be used.</p>' +
          '<div class="cropper-stage"><img class="cropper-image" alt="" draggable="false"><div class="cropper-mask"></div></div>' +
          '<input class="cropper-zoom" type="range" min="0" max="100" value="0" aria-label="Zoom">' +
          '<div class="cropper-actions"><button type="button" class="secondary-btn cropper-cancel">Cancel</button>' +
          '<button type="button" class="primary-btn cropper-apply">Apply</button></div></div>';
        document.body.append(overlay);

        const stage = overlay.querySelector(".cropper-stage");
        const view = overlay.querySelector(".cropper-image");
        const slider = overlay.querySelector(".cropper-zoom");
        view.src = objectUrl;

        const naturalW = img.naturalWidth, naturalH = img.naturalHeight;
        let stageSize = 0, circle = 0, minScale = 1, scale = 1, cx = 0, cy = 0;

        function measure() {
          stageSize = stage.clientWidth;
          circle = stageSize - 28;                       // matches .cropper-mask inset
          minScale = circle / Math.min(naturalW, naturalH); // image always covers the circle
        }
        function render() {
          const dw = naturalW * scale, dh = naturalH * scale;
          const maxX = Math.max(0, (dw - circle) / 2), maxY = Math.max(0, (dh - circle) / 2);
          cx = Math.min(maxX, Math.max(-maxX, cx));
          cy = Math.min(maxY, Math.max(-maxY, cy));
          view.style.width = dw + "px";
          view.style.height = dh + "px";
          view.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
          slider.value = String(((scale / minScale - 1) / (CROP_MAX_ZOOM - 1)) * 100);
        }
        function setScale(next) {
          next = Math.min(minScale * CROP_MAX_ZOOM, Math.max(minScale, next));
          const ratio = next / scale;
          cx *= ratio; cy *= ratio;   // zoom around the circle's center
          scale = next;
          render();
        }
        measure();
        scale = minScale;
        render();

        const onResize = () => {
          const zoom = scale / minScale;
          measure();
          scale = minScale * zoom;
          render();
        };
        window.addEventListener("resize", onResize);

        // Drag (1 pointer) and pinch (2 pointers)
        const pointers = new Map();
        let lastDistance = 0;
        const pinchDistance = () => {
          if (pointers.size < 2) return 0;
          const [a, b] = [...pointers.values()];
          return Math.hypot(a.x - b.x, a.y - b.y);
        };
        stage.addEventListener("pointerdown", event => {
          stage.setPointerCapture(event.pointerId);
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          lastDistance = pinchDistance();
          stage.classList.add("is-dragging");
        });
        stage.addEventListener("pointermove", event => {
          const point = pointers.get(event.pointerId);
          if (!point) return;
          const dx = event.clientX - point.x, dy = event.clientY - point.y;
          point.x = event.clientX; point.y = event.clientY;
          if (pointers.size === 1) {
            cx += dx; cy += dy;
            render();
          } else if (pointers.size === 2) {
            const distance = pinchDistance();
            if (lastDistance) setScale(scale * distance / lastDistance);
            lastDistance = distance;
          }
        });
        const endPointer = event => {
          pointers.delete(event.pointerId);
          lastDistance = pinchDistance();
          if (!pointers.size) stage.classList.remove("is-dragging");
        };
        stage.addEventListener("pointerup", endPointer);
        stage.addEventListener("pointercancel", endPointer);
        stage.addEventListener("wheel", event => {
          event.preventDefault();
          setScale(scale * Math.exp(-event.deltaY * 0.0015));
        }, { passive: false });
        slider.addEventListener("input", () => {
          setScale(minScale * (1 + (Number(slider.value) / 100) * (CROP_MAX_ZOOM - 1)));
        });

        function close(result) {
          window.removeEventListener("resize", onResize);
          document.removeEventListener("keydown", onKey);
          overlay.remove();
          URL.revokeObjectURL(objectUrl);
          resolve(result);
        }
        function onKey(event) { if (event.key === "Escape") close(null); }
        document.addEventListener("keydown", onKey);
        overlay.querySelector(".cropper-cancel").addEventListener("click", () => close(null));
        overlay.querySelector(".cropper-apply").addEventListener("click", () => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = CROP_OUTPUT_SIZE;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#111720"; // fills transparent PNG areas
          ctx.fillRect(0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
          ctx.imageSmoothingQuality = "high";
          const dw = naturalW * scale, dh = naturalH * scale;
          // Source rectangle (in original image pixels) that sits under the circle.
          const sx = (dw / 2 - circle / 2 - cx) / scale;
          const sy = (dh / 2 - circle / 2 - cy) / scale;
          const size = circle / scale;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
          canvas.toBlob(blob => {
            if (!blob) { showToast("Could not process this image."); return; }
            // Unique file name per upload: the server stores the file by name, so a fixed
            // name would make every user's picture overwrite the same file and be cached.
            const unique = (window.crypto && crypto.randomUUID)
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            close(new File([blob], `avatar-${unique}.jpg`, { type: "image/jpeg" }));
          }, "image/jpeg", 0.92);
        });
        overlay.querySelector(".cropper-apply").focus();
      };
      img.src = objectUrl;
    });
  }

  let profilePreviewUrl = null;
  function showProfilePreview(src) {
    const preview = $("profilePreview");
    preview.innerHTML = "";
    preview.textContent = initials(state.username);
    if (!src) return;
    const image = document.createElement("img");
    image.src = src;
    image.alt = "Profile preview";
    image.onerror = () => { image.remove(); preview.textContent = initials(state.username); };
    preview.textContent = "";
    preview.append(image);
  }

  $("chooseProfileFile").addEventListener("click", () => $("profileFile").click());
  $("profileFile").addEventListener("change", async event => {
    const input = event.target;
    const file = input.files?.[0] || null;
    input.value = ""; // lets the user pick the same file again later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.");
      return;
    }
    try {
      const cropped = await openAvatarCropper(file);
      if (!cropped) return; // cancelled: keep whatever was selected before
      state.selectedProfileFile = cropped;
      $("profileFileName").textContent = cropped.name || "New photo selected";
      if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
      profilePreviewUrl = URL.createObjectURL(cropped);
      showProfilePreview(profilePreviewUrl);
    } catch (error) {
      console.error("Could not open the image:", error);
      showToast("Could not open this image.");
    }
  });

  $("settingsForm").addEventListener("submit", async event => {
    event.preventDefault();
    const saveButton = $("saveSettings");
    const description = $("descriptionInput").value.trim();
    const file = state.selectedProfileFile;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    $("settingsMessage").textContent = "";
    try {
      // Upload only when a new image was selected; no request is made during selection.
      if (file) {
        const profileResult = await uploadProfile(file);
        if (!profileResult.ok) {
          throw new Error(responseMessage(profileResult.data, `Profile upload failed (HTTP ${profileResult.status}).`));
        }
        // If the API returns the saved path, update the local preview immediately.
        const returnedProfile = typeof profileResult.data === "string"
          ? profileResult.data
          : (profileResult.data?.profile ?? profileResult.data?.Profile ?? profileResult.data?.url ?? "");
        state.currentProfileUrl = profileSource(returnedProfile) || URL.createObjectURL(file);
        const selfAvatar = $("selfAvatar");
        if (selfAvatar) {
          selfAvatar.innerHTML = "";
          const selfImage = document.createElement("img");
          selfImage.src = state.currentProfileUrl;
          selfImage.alt = "Your profile";
          selfImage.onerror = () => { selfImage.remove(); selfAvatar.textContent = initials(state.username); };
          selfAvatar.append(selfImage);
        }
      }

      // Avoid unintentionally erasing an existing description when the current
      // account description cannot be preloaded (no self-profile GET endpoint was supplied).
      if (description) {
        const descriptionResult = await post(cfg.endpoints.changeDescription, { description }, true);
        if (!descriptionResult.ok) {
          throw new Error(responseMessage(descriptionResult.data, `Description update failed (HTTP ${descriptionResult.status}).`));
        }
      }

      if (!state.profileHub || !state.profileHubReady || !(await state.profileHubReady)) {
        throw new Error("ProfileHub is not connected. Changes were saved, but friends may not have received the live update.");
      }
      await state.profileHub.invoke("SaveChanges");
      state.selectedProfileFile = null;
      $("profileFile").value = "";
      $("profileFileName").textContent = "No new photo";
      $("settingsMessage").textContent = "Your profile has been saved.";
      showToast("Profile updated.");
      // Refresh friend snapshots in case the updated account appears in another list.
      await loadFriendsStatus();
      await loadSelfProfile();
    } catch (error) {
      console.error("Could not save profile settings:", error);
      $("settingsMessage").textContent = error.message || "Could not save your changes.";
      showToast("Could not save all profile changes.");
    } finally {
      saveButton.disabled = false;
      saveButton.innerHTML = 'Save changes <span>→</span>';
    }
  });

  // SignalR automatically removes this connection from every group when the
  // browser/tab disconnects. A hub invocation during page unload is not reliable.
  window.addEventListener("pagehide", () => {
    if (state.hub) state.hub.stop().catch(() => {});
    if (state.profileHub) state.profileHub.stop().catch(() => {});
  });

  function appendMessage(rawMessage, type, options = {}) {
    const message = typeof rawMessage === "string"
      ? normalizeMessage({ Content: rawMessage, SentAt: new Date().toISOString() })
      : normalizeMessage(rawMessage);
    const messages = $("messages");
    if (message.Id !== null &&
        messages.querySelector(`[data-message-id="${CSS.escape(String(message.Id))}"]`)) return;

    // Never trust the caller's visual type for ownership. The sender is the
    // source of truth so an incoming message can never accidentally become
    // deletable just because it was rendered as "outgoing".
    const currentUser = String(state.username || "").trim().toLowerCase();
    const sender = String(message.Sender || "").trim().toLowerCase();
    const isMine = Boolean(currentUser && sender && sender === currentUser);
    const visualType = isMine ? "outgoing" : "incoming";

    const row = document.createElement("div");
    row.className = `message-row ${isMine ? "mine" : "theirs"}`;

    const bubble = document.createElement("div");
    bubble.className = `message ${visualType}`;
    bubble.dataset.owner = sender;
    bubble.dataset.mine = isMine ? "1" : "0";
    if (message.Id !== null) bubble.dataset.messageId = String(message.Id);

    // In group chats, show the other user's avatar/name on the left.
    if (state.activeGroup && message.Sender) {
      if (!isMine) {
        const profile = getFriendProfile(message.Sender)?.profile;
        const avatar = createAvatar(message.Sender, profile, "avatar message-sender");
        avatar.dataset.user = sender;
        avatar.dataset.name = message.Sender;
        row.append(avatar);
      }
      const senderLabel = document.createElement("div");
      senderLabel.className = "message-sender-name";
      senderLabel.textContent = isMine ? "You" : message.Sender;
      bubble.append(senderLabel);
    }

    if (message.Content) {
      const body = document.createElement("div");
      body.className = "message-content";
      body.textContent = message.Content;
      bubble.append(body);
    }
    if (message.File) {
      const attachment = renderMessageAttachment(message.File);
      if (attachment) bubble.append(attachment);
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    const sentAt = new Date(message.SentAt);
    meta.textContent = Number.isNaN(sentAt.getTime()) ? "" :
      sentAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    bubble.append(meta);

    // Delete control is created ONLY for the authenticated user's own message.
    if (message.Id !== null && isMine) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "message-delete-btn";
      deleteButton.title = "Delete message";
      deleteButton.setAttribute("aria-label", "Delete message");
      deleteButton.innerHTML = TRASH_ICON;
      bubble.append(deleteButton);
    }

    row.append(bubble);
    messages.append(row);

    if (options.scroll !== false) {
      if (isMine) pinnedToBottom = true;
      followIfPinned();
    }
  }


  function resolveMessageFile(path) {
    const raw = String(path || "").trim();
    if (!raw) return "";
    try {
      // Message.File is a server-relative path such as Uploads/File/name.ext.
      return new URL(raw.replace(/^\\+/, "").replace(/^\//, ""), window.location.origin + "/").href;
    } catch {
      return "";
    }
  }

  function getAttachmentInfo(path) {
    const clean = String(path || "").split("?")[0].split("#")[0];
    let name = clean.split(/[\\/]/).pop() || "Attachment";
    try { name = decodeURIComponent(name); } catch {}
    const extension = (name.includes(".") ? name.split(".").pop() : "").toLowerCase();
    const groups = [
      { exts: ["zip","rar","7z","tar","gz","bz2","xz","tgz","zst","cab","iso"], icon: "📦", type: "Compressed archive" },
      { exts: ["pdf"], icon: "📕", type: "PDF document" },
      { exts: ["doc","docx","odt","rtf"], icon: "📝", type: "Text document" },
      { exts: ["xls","xlsx","csv","ods"], icon: "📊", type: "Spreadsheet" },
      { exts: ["ppt","pptx","odp"], icon: "📽️", type: "Presentation" },
      { exts: ["txt","md","log"], icon: "📄", type: "Text file" },
      { exts: ["mp3","wav","m4a","aac","flac","opus","wma","aiff"], icon: "🎵", type: "Audio file" },
      { exts: ["mp4","webm","ogg","mov","m4v","avi","mkv","wmv","3gp"], icon: "🎬", type: "Video file" },
      { exts: ["exe","msi","dmg","apk","app","deb","rpm","dll","so","sys"], icon: "⚙️", type: "Application / system file" },
      { exts: ["bin","dat","pak","db","sqlite","bak","dump"], icon: "💾", type: "Data / binary file" },
      { exts: ["js","ts","jsx","tsx","html","css","cs","py","java","cpp","c","h","json","xml","yml","yaml","sql","php","go","rs","sh","ps1"], icon: "💻", type: "Source code" },
      { exts: ["psd","ai","sketch","fig","xd","blend","obj","fbx","stl"], icon: "🎨", type: "Design / 3D file" },
      { exts: ["ttf","otf","woff","woff2"], icon: "🔤", type: "Font file" },
      { exts: ["key","pem","crt","cer","p12","pfx"], icon: "🔐", type: "Certificate / key file" },
      { exts: ["torrent"], icon: "🧲", type: "Torrent file" }
    ];
    const group = groups.find(item => item.exts.includes(extension));
    return {
      name,
      extension: extension ? extension.toUpperCase() : "FILE",
      icon: group?.icon || "📎",
      type: group?.type || "File attachment"
    };
  }

  function renderFileCard(path, urlValue, info = getAttachmentInfo(path)) {
    const card = document.createElement("div");
    card.className = "message-file-card";
    const icon = document.createElement("div");
    icon.className = "message-file-icon";
    icon.textContent = info.icon;
    icon.setAttribute("aria-hidden", "true");

    const details = document.createElement("div");
    details.className = "message-file-details";
    const name = document.createElement("strong");
    name.className = "message-file-name";
    name.textContent = info.name;
    name.title = info.name;
    const type = document.createElement("span");
    type.className = "message-file-type";
    type.textContent = `${info.type} · ${info.extension}`;
    details.append(name, type);

    const download = document.createElement("a");
    download.className = "message-file-download";
    download.href = urlValue;
    download.download = info.name;
    download.rel = "noopener noreferrer";
    download.setAttribute("aria-label", `Download ${info.name}`);
    download.title = "Download file";
    download.textContent = "↓";
    card.append(icon, details, download);
    return card;
  }

  function renderMessageAttachment(path) {
    const urlValue = resolveMessageFile(path);
    if (!urlValue) return null;
    const info = getAttachmentInfo(path);
    const extension = String(path).split("?")[0].split("#")[0].split(".").pop().toLowerCase();
    const wrapper = document.createElement("div");
    wrapper.className = "message-attachment";

    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "svg", "tif", "tiff"].includes(extension)) {
      const image = document.createElement("img");
      image.src = urlValue;
      image.alt = "Image attachment";
      image.draggable = false;
      image.loading = "lazy";
      image.addEventListener("load", followIfPinned);
      image.addEventListener("error", () => {
        // Some servers send image files as application/octet-stream. Keep the
        // message tidy and downloadable instead of showing a broken image.
        wrapper.classList.remove("image-attachment");
        wrapper.replaceChildren(renderFileCard(path, urlValue, info));
        followIfPinned();
      }, { once: true });
      wrapper.classList.add("image-attachment");
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("tabindex", "0");
      wrapper.setAttribute("aria-label", "View image");
      wrapper.addEventListener("click", event => {
        if (event.target.closest("a")) return;
        if (event.button !== 0) return;
        openImageViewer(urlValue, image.alt);
      });
      wrapper.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openImageViewer(urlValue, image.alt); }
      });
      wrapper.append(image);
    } else if (["mp4", "webm", "ogg", "mov", "m4v"].includes(extension)) {
      const video = document.createElement("video");
      video.src = urlValue;
      video.controls = false;
      video.playsInline = true;
      video.preload = "metadata";
      video.disablePictureInPicture = true;
      video.setAttribute("aria-label", "Video message");
      wrapper.classList.add("video-attachment");
      const controls = document.createElement("div");
      controls.className = "monter-video-controls";
      const play = document.createElement("button");
      play.type = "button"; play.className = "video-play"; play.textContent = "▶"; play.setAttribute("aria-label", "Play video");
      const seek = document.createElement("input");
      seek.type = "range"; seek.min = "0"; seek.max = "1000"; seek.value = "0"; seek.className = "video-seek"; seek.setAttribute("aria-label", "Seek video");
      const clock = document.createElement("span"); clock.className = "video-clock"; clock.textContent = "0:00 / 0:00";
      const mute = document.createElement("button"); mute.type = "button"; mute.className = "video-mute"; mute.textContent = "♫"; mute.setAttribute("aria-label", "Mute video");
      const fullscreen = document.createElement("button"); fullscreen.type = "button"; fullscreen.className = "video-fullscreen"; fullscreen.textContent = "⛶"; fullscreen.setAttribute("aria-label", "Enter fullscreen"); fullscreen.title = "Fullscreen";
      const formatTime = value => { if (!Number.isFinite(value)) return "0:00"; const n = Math.floor(value); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
      const sync = () => { seek.value = video.duration ? String(Math.round(video.currentTime / video.duration * 1000)) : "0"; clock.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`; play.textContent = video.paused ? "▶" : "Ⅱ"; };
      play.addEventListener("click", () => video.paused ? video.play().catch(() => showToast("Could not play this video.")) : video.pause());
      video.addEventListener("click", () => video.paused ? video.play().catch(() => {}) : video.pause());
      video.addEventListener("timeupdate", sync); video.addEventListener("loadedmetadata", () => { sync(); followIfPinned(); });
      video.addEventListener("play", sync); video.addEventListener("pause", sync);
      seek.addEventListener("input", () => { if (video.duration) video.currentTime = Number(seek.value) / 1000 * video.duration; });
      mute.addEventListener("click", () => { video.muted = !video.muted; mute.classList.toggle("is-active", video.muted); mute.textContent = video.muted ? "×" : "♫"; });
      const updateFullscreenState = () => {
        const isFullscreen = document.fullscreenElement === wrapper || document.webkitFullscreenElement === wrapper;
        wrapper.classList.toggle("is-video-fullscreen", isFullscreen);
        fullscreen.textContent = isFullscreen ? "⤢" : "⛶";
        fullscreen.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
        fullscreen.title = isFullscreen ? "Exit fullscreen" : "Fullscreen";
      };
      fullscreen.addEventListener("click", async event => {
        event.stopPropagation();
        try {
          if (document.fullscreenElement === wrapper || document.webkitFullscreenElement === wrapper) {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          } else if (wrapper.requestFullscreen) {
            await wrapper.requestFullscreen();
          } else if (wrapper.webkitRequestFullscreen) {
            wrapper.webkitRequestFullscreen();
          } else if (video.webkitEnterFullscreen) {
            video.webkitEnterFullscreen();
          }
        } catch { showToast("Fullscreen is not available in this browser."); }
      });
      document.addEventListener("fullscreenchange", updateFullscreenState);
      document.addEventListener("webkitfullscreenchange", updateFullscreenState);
      video.addEventListener("error", () => {
        wrapper.classList.remove("video-attachment");
        wrapper.replaceChildren(renderFileCard(path, urlValue, info));
      }, { once: true });
      controls.append(play, seek, clock, mute, fullscreen);
      wrapper.append(video, controls);
    } else if (["mp3", "wav", "m4a", "aac", "flac", "opus"].includes(extension)) {
      const audio = document.createElement("audio");
      audio.src = urlValue;
      audio.controls = true;
      audio.preload = "metadata";
      audio.addEventListener("error", () => wrapper.replaceChildren(renderFileCard(path, urlValue, info)), { once: true });
      wrapper.append(audio);
    } else {
      // Archives, executables, binaries, documents and unknown extensions use
      // one predictable file-card design instead of exposing a naked URL.
      wrapper.append(renderFileCard(path, urlValue, info));
    }
    return wrapper;
  }

  function openImageViewer(src, alt = "Image") {
    document.querySelector(".media-viewer")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "media-viewer";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Image viewer");
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    image.draggable = false;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "media-viewer-close";
    close.setAttribute("aria-label", "Close image viewer");
    close.textContent = "×";
    const download = document.createElement("a");
    download.className = "media-viewer-download";
    download.href = src;
    download.target = "_blank";
    download.rel = "noopener noreferrer";
    download.textContent = "Open original ↗";
    const toolbar = document.createElement("div");
    toolbar.className = "media-viewer-toolbar";
    toolbar.append(download);
    overlay.append(close, image, toolbar);
    const dismiss = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = event => { if (event.key === "Escape") dismiss(); };
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", event => { if (event.target === overlay) dismiss(); });
    image.addEventListener("dragstart", event => event.preventDefault());
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    close.focus({ preventScroll: true });
  }

  // Native drag is disabled for app imagery, while the normal context menu remains available.
  document.addEventListener("dragstart", event => {
    if (event.target.closest("img, .message-attachment")) event.preventDefault();
  }, true);

  function initials(value) { return String(value || "?").trim().slice(0, 1).toUpperCase(); }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }

  // Restore a previously authenticated session. Invalid/expired JWTs are cleared on 401 responses.
  if (state.token) enterApp(); else switchAuth("signup");
})(); 
