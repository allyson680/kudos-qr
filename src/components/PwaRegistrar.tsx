"use client";

import { useEffect } from "react";

// Minimal type for the Chrome BIP event
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __bipEvent?: BeforeInstallPromptEvent;
    __hasBipListener?: boolean;
  }
}

export default function PwaRegistrar() {
  useEffect(() => {
    // Register SW after page load to avoid race conditions
    if ("serviceWorker" in navigator) {
      const onLoad = () => {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none", scope: "/" })
          .catch(() => {});
      };
      if (document.readyState === "complete") onLoad();
      else window.addEventListener("load", onLoad, { once: true });
    }

    // Only one BIP listener for the whole app (prevents duplicates)
    if (!window.__hasBipListener) {
      window.__hasBipListener = true;

      window.addEventListener(
        "beforeinstallprompt",
        (e: Event) => {
          // Stop Chrome's mini-infobar
          e.preventDefault?.();
          // Stash the event for your install button/page
          window.__bipEvent = e as BeforeInstallPromptEvent;
        },
        { once: false } // still fine; we gate with the global flag
      );

      // Clear the stashed event once installed
      window.addEventListener("appinstalled", () => {
        window.__bipEvent = undefined;
      });
    }
  }, []);

  return null;
}
