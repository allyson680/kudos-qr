// src/app/install/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallLanding() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const firedRef = useRef(false);

  // Capture the beforeinstallprompt event
  useEffect(() => {
    function onBIP(e: Event) {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShowManual(false);
    }
    window.addEventListener("beforeinstallprompt", onBIP as any);

    // If already installed, hide installer UI
    const isStandalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      // older Chrome:
      (navigator as any).standalone === true;
    setInstalled(isStandalone);

    // “appinstalled” fires after a successful install
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const intentUrl = useMemo(() => {
    if (typeof window === "undefined") return "#";
    const { host, pathname, search } = window.location;
    return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
  }, []);

  const handleInstallClick = async () => {
    if (!deferred || firedRef.current) {
      // No prompt available (likely in a Custom Tab) – show manual instructions
      setShowManual(true);
      return;
    }
    firedRef.current = true;
    try {
      await deferred.prompt();
      await deferred.userChoice?.catch(() => {});
    } finally {
      setDeferred(null);
    }
  };

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">Install Token of Excellence</h1>

        <div className="rounded-lg border p-4 space-y-3">
          {!installed ? (
            <>
              <button
                onClick={handleInstallClick}
                className="w-full py-3 rounded bg-emerald-700 text-white font-semibold"
              >
                {deferred ? "Install app" : "Install app"}
              </button>

              {/* If we don’t have the install prompt, we’re probably in a Custom Tab */}
              <button
                onClick={() => (window.location.href = intentUrl)}
                className="w-full py-3 rounded border font-semibold"
                title="Open in full Chrome to reveal the Install menu"
              >
                Open in Chrome
              </button>

              {showManual && (
                <div className="text-sm text-gray-700 dark:text-gray-200 space-y-2">
                  <p><b>If you still don’t see Install:</b></p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Tap <em>Open in Chrome</em> above.</li>
                    <li>In Chrome, tap the <b>⋮</b> menu.</li>
                    <li>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</li>
                  </ol>
                  <p className="mt-2 text-xs opacity-80">
                    Samsung Internet: Menu → <b>Add page to</b> → <b>Home screen</b>.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <p className="font-medium">Already installed 🎉</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">You can open it from your home screen.</p>
            </div>
          )}
        </div>

        <p className="text-xs text-center text-gray-500">
          Tip: QR scanners often open links in a limited view. Use <em>Open in Chrome</em> if you don’t see Install.
        </p>
      </div>
    </main>
  );
}
