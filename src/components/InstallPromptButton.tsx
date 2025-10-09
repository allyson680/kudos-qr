// src/components/InstallPromptButton.tsx
"use client";

import { useEffect, useState } from "react";

function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  // @ts-ignore
  if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
  return false;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPromptButton() {
  const [canInstall, setCanInstall] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    // Re-check when page gains focus (BIP can arrive later)
    const sync = () => setCanInstall(!!window.__bipEvent);
    sync();
    window.addEventListener("focus", sync);

    // iOS never fires BIP — show a lightweight hint once
    if (isIOS()) {
      const t = setTimeout(() => setShowIOSHint(true), 1000);
      return () => {
        window.removeEventListener("focus", sync);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener("focus", sync);
  }, []);

  if (isStandalone()) return null;

  const handleInstall = async () => {
    const ev = window.__bipEvent;
    if (!ev) return;
    try {
      await ev.prompt();
      // Optional: await ev.userChoice;
    } finally {
      // Clear so we can’t prompt twice
      window.__bipEvent = undefined;
      setCanInstall(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
      {canInstall && (
        <div className="rounded-2xl shadow-lg bg-white border p-3">
          <div className="font-medium mb-2">Install app?</div>
          <p className="text-sm text-gray-600 mb-3">
            Add Token of Excellence to your home screen for quick access.
          </p>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-black text-white flex-1"
              onClick={handleInstall}
            >
              Install
            </button>
            <button
              className="px-3 py-2 rounded border flex-1"
              onClick={() => {
                window.__bipEvent = undefined;
                setCanInstall(false);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {!canInstall && showIOSHint && (
        <div className="rounded-2xl shadow-lg bg-white border p-3">
          <div className="font-medium mb-1">Add to Home Screen</div>
          <p className="text-sm text-gray-600">
            In Safari: tap <b>Share</b> → <b>Add to Home Screen</b>.
          </p>
          <div className="mt-2 text-right">
            <button
              className="px-3 py-1 text-sm underline"
              onClick={() => setShowIOSHint(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
