// MONTER Service Worker
// This initial version enables PWA service-worker registration.
// It deliberately does not cache authenticated pages, messages, or API responses.

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});
