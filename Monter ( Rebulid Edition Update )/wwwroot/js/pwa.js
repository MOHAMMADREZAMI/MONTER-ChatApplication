// MONTER PWA installation
(() => {
    const installButton = document.getElementById("installAppButton");
    if (!installButton) return;

    let deferredPrompt = null;

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;

    if (isStandalone) return;

    // iOS Safari does not support beforeinstallprompt. Show manual instructions.
    if (isIos) {
        installButton.classList.remove("hidden");
        installButton.addEventListener("click", () => {
            alert('To install MONTER: tap the Share button in Safari, then choose "Add to Home Screen".');
        });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;
        installButton.classList.remove("hidden");
    });

    installButton.addEventListener("click", async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installButton.classList.add("hidden");
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        installButton.classList.add("hidden");
    });

    // Register the service worker from the site root so it controls the whole app.
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/service-worker.js")
                .catch((error) => console.error("MONTER Service Worker registration failed:", error));
        });
    }
})();
