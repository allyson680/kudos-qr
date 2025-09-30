// components/InstallPromptButton.tsx
"use client";

import { useEffect, useState } from "react";

// Narrow type for the "beforeinstallprompt" event
type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Android/Chromium
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  // @ts-ignore - not in TS lib
  if (typeof navigator !== "undefined" && navigator.standalone) return true;
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPromptButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIOSNudge, setShowIOSNudge] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      // Chrome/Edge on Android
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show a gentle nudge
    let iosTimer: number | undefined;
    if (isIOS()) {
      iosTimer = window.setTimeout(() => setShowIOSNudge(true), 1200);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  // Already installed or running as a PWA → no button
  if (installed || isStandalone()) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
      {/* ANDROID/CHROMIUM PROMPT */}
      {deferred && (
        <div className="rounded-2xl shadow-lg bg-white border p-3">
          <div className="font-medium mb-2">Install app?</div>
          <p className="text-sm text-gray-600 mb-3">
            Add <b>Token of Excellence</b> to your home screen for quick access.
          </p>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-black text-white flex-1"
              onClick={async () => {
                deferred.prompt();
                await deferred.userChoice; // "accepted" or "dismissed"
                setDeferred(null);
              }}
            >
              Install
            </button>
            <button
              className="px-3 py-2 rounded border flex-1"
              onClick={() => setDeferred(null)}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* iOS NUDGE */}
      {!deferred && isIOS() && showIOSNudge && (
        <div className="rounded-2xl shadow-lg bg-white border p-3">
          <div className="font-medium mb-2">Add to Home Screen</div>
          <p className="text-sm text-gray-600">
            In Safari: tap <b>Share</b> → <b>Add to Home Screen</b>.
          </p>
          <div className="mt-2 text-right">
            <button
              className="px-3 py-1 text-sm underline"
              onClick={() => setShowIOSNudge(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
