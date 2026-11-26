/* MONTER — UI behaviour only (no API / SignalR logic lives here).
   Handles: the compact search mode, tapping an existing friend in search
   results, the in-app image viewer + video player, and the phone "Back"
   button / gesture (viewer → chat → list). */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const sidebar = document.querySelector(".sidebar");
  const mainView = $("mainView");
  const searchInput = $("searchInput");
  if (!sidebar || !mainView || !searchInput) return;

  /* ---------- Search mode ---------- */
  function openSearch() {
    sidebar.classList.add("is-searching");
    searchInput.focus();
  }
  function closeSearch() {
    if (!sidebar.classList.contains("is-searching")) return;
    sidebar.classList.remove("is-searching");
    if (searchInput.value) {
      searchInput.value = "";
      searchInput.dispatchEvent(new Event("input", { bubbles: true })); // lets app.js reset its results
    }
  }
  $("searchToggle").addEventListener("click", openSearch);
  $("findPeopleButton").addEventListener("click", openSearch);
  $("searchClose").addEventListener("click", closeSearch);
  searchInput.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSearch(); });

  // Tapping a person who is already a friend opens that chat.
  $("searchResults").addEventListener("click", (event) => {
    if (event.target.closest(".add-btn:not(:disabled)")) return;           // the "+" button keeps its own job
    const row = event.target.closest(".result-item");
    if (!row) return;
    const name = (row.querySelector(".result-name")?.textContent || "").trim().toLowerCase();
    const friend = [...document.querySelectorAll("#friendsList .friend-item")]
      .find((item) => (item.querySelector("strong")?.textContent || "").trim().toLowerCase() === name);
    if (!friend) return;
    closeSearch();
    $("switchFriends").click();
    friend.click();
  });


  /* ==========================================================================
     Media: in-app image viewer + custom video player
     ========================================================================== */
  const svg = (id, extra = "") => `<svg class="ico ${extra}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const messagesEl = $("messages");

  /* ---------- Image viewer ---------- */
  const lb = { el: null, img: null, items: [], index: 0, open: false, pushed: false };

  function buildLightbox() {
    const el = document.createElement("div");
    el.className = "lightbox hidden";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Image viewer");
    el.innerHTML =
      '<div class="lightbox-bar">' +
        '<span class="lightbox-count"></span>' +
        '<span class="lightbox-actions">' +
          `<a class="round-btn lightbox-download" title="Download" aria-label="Download" target="_blank" rel="noopener">${svg("i-download")}</a>` +
          `<button type="button" class="round-btn lightbox-close" title="Close" aria-label="Close">${svg("i-close")}</button>` +
        '</span>' +
      '</div>' +
      `<button type="button" class="round-btn lightbox-nav prev" aria-label="Previous image">${svg("i-chev-left")}</button>` +
      `<button type="button" class="round-btn lightbox-nav next" aria-label="Next image">${svg("i-chev-right")}</button>` +
      '<div class="lightbox-stage"><img class="lightbox-img" alt="" draggable="false"></div>';
    document.body.append(el);
    lb.el = el;
    lb.img = el.querySelector(".lightbox-img");

    el.querySelector(".lightbox-close").addEventListener("click", () => closeLightbox(true));
    el.querySelector(".prev").addEventListener("click", () => stepLightbox(-1));
    el.querySelector(".next").addEventListener("click", () => stepLightbox(1));
    lb.img.addEventListener("click", () => el.classList.toggle("is-zoomed"));
    el.querySelector(".lightbox-stage").addEventListener("click", (event) => {
      if (event.target.classList.contains("lightbox-stage")) closeLightbox(true);
    });
    // swipe left / right to change image
    let startX = null;
    el.addEventListener("touchstart", (event) => { startX = event.touches.length === 1 ? event.touches[0].clientX : null; }, { passive: true });
    el.addEventListener("touchend", (event) => {
      if (startX === null || el.classList.contains("is-zoomed")) return;
      const dx = event.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) > 60) stepLightbox(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function showLightboxItem() {
    const item = lb.items[lb.index];
    if (!item) return;
    const src = item.currentSrc || item.src;
    lb.el.classList.remove("is-zoomed");
    lb.img.src = src;
    const name = decodeURIComponent((src.split("?")[0].split("/").pop() || "image"));
    const link = lb.el.querySelector(".lightbox-download");
    link.href = src;
    link.setAttribute("download", name);
    const many = lb.items.length > 1;
    lb.el.querySelector(".lightbox-count").textContent = many ? `${lb.index + 1} / ${lb.items.length}` : "";
    lb.el.querySelector(".prev").classList.toggle("hidden", !many || lb.index === 0);
    lb.el.querySelector(".next").classList.toggle("hidden", !many || lb.index === lb.items.length - 1);
  }
  function stepLightbox(delta) {
    const next = lb.index + delta;
    if (next < 0 || next >= lb.items.length) return;
    lb.index = next;
    showLightboxItem();
  }
  function openLightbox(clicked) {
    if (!lb.el) buildLightbox();
    lb.items = [...messagesEl.querySelectorAll(".message-attachment img")];
    lb.index = Math.max(0, lb.items.indexOf(clicked));
    showLightboxItem();
    lb.el.classList.remove("hidden");
    lb.open = true;
    document.addEventListener("keydown", onLightboxKey, true);
    if (!lb.pushed) { push(); lb.pushed = true; }       // phone Back button closes the viewer
    lb.el.querySelector(".lightbox-close").focus();
  }
  function closeLightbox(fromUi) {
    if (!lb.open) return;
    lb.open = false;
    lb.el.classList.add("hidden");
    lb.img.removeAttribute("src");
    document.removeEventListener("keydown", onLightboxKey, true);
    if (lb.pushed) {
      lb.pushed = false;
      if (fromUi) unwind(1);
    }
  }
  function onLightboxKey(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeLightbox(true); }
    else if (event.key === "ArrowLeft") stepLightbox(-1);
    else if (event.key === "ArrowRight") stepLightbox(1);
  }

  // Capture phase: runs before app.js's own "open in a new tab" handler on the image.
  messagesEl.addEventListener("click", (event) => {
    const img = event.target.closest(".message-attachment img");
    if (!img) return;
    event.preventDefault();
    event.stopPropagation();
    openLightbox(img);
  }, true);

  /* ---------- Video player ---------- */
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }
  const SPEEDS = [1, 1.5, 2, 0.5];
  let playingVideo = null;

  function enhanceVideo(video) {
    if (video.dataset.mplayer) return;
    const box = video.parentElement;
    if (!box || !box.classList.contains("message-attachment")) return;
    video.dataset.mplayer = "1";
    video.controls = false;
    video.removeAttribute("controls");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    box.classList.add("mplayer", "is-paused");

    const ui = document.createElement("div");
    ui.className = "mp-ui";
    ui.innerHTML =
      `<button type="button" class="mp-big" aria-label="Play">${svg("i-play", "ico-fill")}</button>` +
      '<div class="mp-error hidden"><strong>This video can\u2019t be played here</strong><span>Your browser doesn\u2019t support this format.</span><a class="mp-download" target="_blank" rel="noopener">Download file</a></div>' +
      '<div class="mp-bar">' +
        `<button type="button" class="mp-btn mp-toggle" aria-label="Play">${svg("i-play", "ico-fill")}</button>` +
        '<span class="mp-time">0:00</span>' +
        '<input class="mp-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">' +
        '<span class="mp-dur">0:00</span>' +
        '<button type="button" class="mp-btn mp-speed" aria-label="Playback speed">1\u00d7</button>' +
        `<button type="button" class="mp-btn mp-mute" aria-label="Mute">${svg("i-volume")}</button>` +
        `<button type="button" class="mp-btn mp-full" aria-label="Full screen">${svg("i-expand")}</button>` +
      '</div>';
    box.append(ui);

    const big = ui.querySelector(".mp-big"), toggleBtn = ui.querySelector(".mp-toggle");
    const seek = ui.querySelector(".mp-seek"), timeEl = ui.querySelector(".mp-time"), durEl = ui.querySelector(".mp-dur");
    const speedBtn = ui.querySelector(".mp-speed"), muteBtn = ui.querySelector(".mp-mute"), fullBtn = ui.querySelector(".mp-full");
    const errorEl = ui.querySelector(".mp-error");
    let scrubbing = false, hideTimer = null, speedIndex = 0;

    const setIcon = (button, id, label) => { button.querySelector("use").setAttribute("href", "#" + id); button.setAttribute("aria-label", label); };
    const toggle = () => { if (video.paused || video.ended) video.play().catch(() => {}); else video.pause(); };
    const showControls = () => {
      box.classList.remove("controls-hidden");
      clearTimeout(hideTimer);
      if (!video.paused) hideTimer = setTimeout(() => box.classList.add("controls-hidden"), 2600);
    };
    const paintSeek = () => {
      const ratio = video.duration ? video.currentTime / video.duration : 0;
      seek.style.setProperty("--fill", `${Math.min(100, Math.max(0, ratio * 100))}%`);
      if (!scrubbing) seek.value = String(Math.round(ratio * 1000));
      timeEl.textContent = formatTime(video.currentTime);
    };

    big.addEventListener("click", (event) => { event.stopPropagation(); toggle(); });
    toggleBtn.addEventListener("click", toggle);
    video.addEventListener("click", () => { toggle(); showControls(); });
    video.addEventListener("dblclick", () => fullBtn.click());

    video.addEventListener("play", () => {
      if (playingVideo && playingVideo !== video) playingVideo.pause();
      playingVideo = video;
      box.classList.remove("is-paused");
      setIcon(toggleBtn, "i-pause", "Pause");
      showControls();
    });
    const onPause = () => {
      box.classList.add("is-paused");
      setIcon(toggleBtn, "i-play", "Play");
      showControls();
    };
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("timeupdate", paintSeek);
    video.addEventListener("loadedmetadata", () => { durEl.textContent = formatTime(video.duration); paintSeek(); });
    video.addEventListener("durationchange", () => { durEl.textContent = formatTime(video.duration); });
    video.addEventListener("volumechange", () => setIcon(muteBtn, video.muted || video.volume === 0 ? "i-mute" : "i-volume", video.muted ? "Unmute" : "Mute"));
    video.addEventListener("error", () => {
      errorEl.querySelector(".mp-download").href = video.currentSrc || video.src;
      errorEl.classList.remove("hidden");
      box.classList.add("has-error");
    });

    seek.addEventListener("input", () => {
      scrubbing = true;
      if (video.duration) video.currentTime = (Number(seek.value) / 1000) * video.duration;
      paintSeek();
    });
    seek.addEventListener("change", () => { scrubbing = false; });
    seek.addEventListener("pointerup", () => { scrubbing = false; });

    muteBtn.addEventListener("click", () => { video.muted = !video.muted; });
    speedBtn.addEventListener("click", () => {
      speedIndex = (speedIndex + 1) % SPEEDS.length;
      video.playbackRate = SPEEDS[speedIndex];
      speedBtn.textContent = `${SPEEDS[speedIndex]}\u00d7`;
    });

    // Full screen: real Fullscreen API where it exists, otherwise an in-app expanded view (iPhone).
    const isFull = () => document.fullscreenElement === box || box.classList.contains("is-expanded");
    const syncFull = () => { setIcon(fullBtn, isFull() ? "i-shrink" : "i-expand", isFull() ? "Exit full screen" : "Full screen"); };
    fullBtn.addEventListener("click", () => {
      if (isFull()) {
        if (document.fullscreenElement === box) document.exitFullscreen?.();
        box.classList.remove("is-expanded");
        syncFull();
      } else if (box.requestFullscreen) {
        box.requestFullscreen().catch(() => { box.classList.add("is-expanded"); syncFull(); });
      } else {
        box.classList.add("is-expanded");
        syncFull();
      }
    });
    document.addEventListener("fullscreenchange", syncFull);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && box.classList.contains("is-expanded")) { box.classList.remove("is-expanded"); syncFull(); }
    });

    box.addEventListener("pointermove", showControls);
    box.addEventListener("keydown", (event) => {
      if (event.target.closest(".mp-seek")) return;
      if (event.key === " " || event.key.toLowerCase() === "k") { event.preventDefault(); toggle(); }
      else if (event.key === "ArrowRight") video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
      else if (event.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 5);
      else if (event.key.toLowerCase() === "m") video.muted = !video.muted;
      else if (event.key.toLowerCase() === "f") fullBtn.click();
    });
    if (video.readyState >= 1) { durEl.textContent = formatTime(video.duration); paintSeek(); }
    if (video.error) video.dispatchEvent(new Event("error"));
  }

  function enhanceAll(root) {
    (root || messagesEl).querySelectorAll(".message-attachment video:not([data-mplayer])").forEach(enhanceVideo);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) { enhanceAll(); break; }
    }
  }).observe(messagesEl, { childList: true, subtree: true });
  enhanceAll();

  /* ---------- Phone back button / swipe-back ---------- */
  const panel = $("friendProfilePanel");
  const phone = window.matchMedia("(max-width: 760px)");
  const overlayMode = window.matchMedia("(max-width: 1100px)");
  const pushed = { chat: false, panel: false };
  let ignoreNext = 0;

  function push() { history.pushState({ monter: true }, ""); }
  function unwind(count) {
    if (count <= 0) return;
    ignoreNext += 1;                 // one popstate fires for the whole jump
    history.go(-count);
  }

  function sync() {
    const chatOpen = mainView.classList.contains("chat-open") && phone.matches;
    const panelOpen = !panel.classList.contains("hidden") && overlayMode.matches;
    let toUnwind = 0;

    if (chatOpen && !pushed.chat) { push(); pushed.chat = true; }
    if (panelOpen && !pushed.panel) { push(); pushed.panel = true; }
    if (!panelOpen && pushed.panel) { pushed.panel = false; toUnwind += 1; }
    if (!chatOpen && pushed.chat) { pushed.chat = false; toUnwind += 1; }
    unwind(toUnwind);
  }

  window.addEventListener("popstate", () => {
    if (ignoreNext > 0) { ignoreNext -= 1; return; }
    if (lb.open) { closeLightbox(false); return; }   // Back closes the image viewer first
    if (pushed.panel) {
      pushed.panel = false;
      $("closeFriendProfile").click();
    } else if (pushed.chat) {
      pushed.chat = false;
      $("chatBackButton").click();
    }
  });

  const observer = new MutationObserver(sync);
  observer.observe(mainView, { attributes: true, attributeFilter: ["class"] });
  observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
})();
