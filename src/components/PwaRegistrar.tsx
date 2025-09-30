// components/PwaRegistrar.tsx
"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    // Only run in the browser + with SW support
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // optional: skip in dev

    const swPath = "/sw.js";

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register(swPath, { scope: "/" });

        // Optional: detect updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            // If there's an existing controller, the new SW is an update
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Dispatch an event you can listen for to show a “refresh” toast, etc.
              document.dispatchEvent(new Event("SW_UPDATED"));
            }
          });
        });
      } catch (err) {
        // Silently ignore; SW is a progressive enhancement
        // console.error("SW registration failed:", err);
      }
    };

    // Register after page load
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
