// src/app/install/page.tsx
"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    __bipEvent?: any;
  }
}

export default function InstallPage() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [hasEvent, setHasEvent] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-ignore
      navigator.standalone === true
    );

    // If Chrome already gave us the event, auto prompt once
    if (window.__bipEvent && "prompt" in window.__bipEvent) {
      window.__bipEvent.prompt().finally(() => {
        // keep it for manual retry in case user dismissed
        setHasEvent(!!window.__bipEvent);
      });
    } else {
      setHasEvent(false);
    }

    // In case the event arrives later (page focus/refresh), poll briefly
    const id = setInterval(() => {
      if (window.__bipEvent) {
        setHasEvent(true);
        clearInterval(id);
      }
    }, 500);

    return () => clearInterval(id);
  }, []);

  const doInstall = async () => {
    const ev = window.__bipEvent;
    if (!ev) return;
    try {
      await ev.prompt();
      await ev.userChoice;
    } finally {
      // clear so it won’t double prompt
      window.__bipEvent = undefined;
      setHasEvent(false);
    }
  };

  if (isStandalone) {
    return (
      <main className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-lg font-semibold mb-2">You’re all set ✅</h1>
        <p>“Token of Excellence” is already on your home screen.</p>
      </main>
    );
  }

  if (isIOS) {
    return (
      <main className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-lg font-semibold mb-3">Add to Home Screen</h1>
        <p className="text-sm text-gray-700">
          In Safari: tap <b>Share</b> → <b>Add to Home Screen</b>.
        </p>
      </main>
    );
  }

  // Android (Chrome)
  return (
    <main className="p-6 max-w-md mx-auto text-center space-y-4">
      <h1 className="text-lg font-semibold">Install Token of Excellence</h1>
      <p className="text-sm text-gray-700">
        If you didn’t see a prompt, tap the button below.
      </p>

      <button
        className={`px-4 py-2 rounded text-white w-full max-w-xs mx-auto ${
          hasEvent ? "bg-black" : "bg-gray-400 cursor-not-allowed"
        }`}
        disabled={!hasEvent}
        onClick={doInstall}
      >
        Install
      </button>

      {!hasEvent && (
        <p className="text-xs text-gray-600">
          Waiting for the install option… If nothing appears, try opening in
          Chrome and refresh this page.
        </p>
      )}

      <a
        href="/"
        className="inline-block text-sm underline text-gray-700"
      >
        Or just open the app
      </a>
    </main>
  );
}
