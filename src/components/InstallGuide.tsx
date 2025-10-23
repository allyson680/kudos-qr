"use client";

import { useEffect, useMemo, useState } from "react";

function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  // @ts-ignore
  if (typeof navigator.standalone === "boolean" && navigator.standalone) return true;
  return false;
}

function detectOS() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const lower = ua.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(lower);
  const isAndroid = /android/.test(lower);
  const isChrome =
    /Chrome/.test(ua) && !/Edg|OPR|SamsungBrowser/i.test(ua); // real Chrome (not Edge/Opera/Samsung)
  return { isIOS, isAndroid, isChrome };
}

export default function InstallGuide() {
  const [{ isIOS, isAndroid, isChrome }, setPlat] = useState({
    isIOS: false,
    isAndroid: false,
    isChrome: false,
  });
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    setPlat(detectOS());
  }, []);

  useEffect(() => {
    const bip = (e: any) => {
      // Don’t let Chrome show the mini-infobar; we’ll trigger manually
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", bip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", bip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Build an intent:// URL that asks Android to open this same page in Chrome
  const chromeIntent = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("src", "open-in-chrome");
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;end`;
  }, []);

  const currentUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("src", "open-in-chrome");
    return url.toString();
  }, []);

  const handleOpenInChrome = () => {
    if (!isAndroid) return;
    // Try to jump into Chrome
    window.location.href = chromeIntent;
    // Fallback if the intent isn’t handled (e.g., Chrome not installed)
    setTimeout(() => {
      if (currentUrl) window.location.href = currentUrl;
    }, 800);
  };

  if (installed) {
    return (
      <main className="max-w-md mx-auto p-6 space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Installed 🎉</h1>
        <p className="text-gray-600">You can launch Token of Excellence from your home screen.</p>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-semibold text-center">Add to Home Screen</h1>

      {/* ANDROID */}
      {isAndroid && (
        <section className="rounded-2xl border p-4 space-y-3">
          <h2 className="font-medium">Android</h2>

          {/* If Chrome's BIP is available, offer your Install button */}
          {deferred ? (
            <>
              <p className="text-sm text-gray-700">
                Tap <b>Install</b> to add Token of Excellence to your home screen.
              </p>
              <button
                className="w-full py-3 rounded-lg bg-black text-white"
                onClick={async () => {
                  deferred.prompt();
                  await deferred.userChoice;
                  setDeferred(null);
                }}
              >
                Install
              </button>
            </>
          ) : (
            <>
              {/* If not already in Chrome, show an Open in Chrome jump (intent URL) */}
              {!isChrome && (
                <>
                  <p className="text-sm text-gray-700">
                    If you don’t see an install prompt, open this page in <b>Chrome</b> first.
                  </p>
                  <button
                    className="block w-full text-center py-3 rounded-lg border"
                    onClick={handleOpenInChrome}
                  >
                    Open in Chrome
                  </button>
                </>
              )}

              {/* General A2HS steps (works in Chrome) */}
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700 mt-1">
                <li>Open the menu <b>(⋮)</b>.</li>
                <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                <li>Confirm to add the app icon.</li>
              </ol>
            </>
          )}
        </section>
      )}

      {/* iOS */}
      {isIOS && (
        <section className="rounded-2xl border p-4 space-y-3">
          <h2 className="font-medium">iPhone / iPad (Safari)</h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
            <li>
              Tap <b>Share</b> <span aria-hidden>（□↑）</span> in the toolbar.
            </li>
            <li>
              Choose <b>Add to Home Screen</b>. If you don’t see it, scroll down and tap{" "}
              <b>Edit Actions…</b>, then add it to Favorites.
            </li>
          </ol>
          <p className="text-xs text-gray-500">
            Tip: if your QR opened inside another app, tap <b>Open in Safari</b> first.
          </p>
        </section>
      )}

      {/* Fallback / Other browsers */}
      {!isAndroid && !isIOS && (
        <section className="rounded-2xl border p-4 space-y-2">
          <h2 className="font-medium">Desktop or other browsers</h2>
          <p className="text-sm text-gray-700">
            In Chrome or Edge, use the address-bar install icon or menu → <b>Install app</b>.
          </p>
        </section>
      )}
    </main>
  );
}
