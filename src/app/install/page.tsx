"use client";

import { useEffect, useState } from "react";

export default function InstallPage() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // @ts-ignore
      navigator.standalone === true
    );

    // Auto-prompt on Android once
    const ev = window.__bipEvent;
    if (ev && "prompt" in ev) {
      ev.prompt().finally(() => (window.__bipEvent = undefined));
    }
  }, []);

  if (isStandalone) {
    return (
      <main className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-lg font-semibold mb-2">You’re all set ✅</h1>
        <p>“Token of Excellence” is already installed.</p>
      </main>
    );
  }

  if (isIOS) {
    return (
      <main className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-lg font-semibold mb-2">Add to Home Screen</h1>
        <p>In Safari: tap <b>Share</b> → <b>Add to Home Screen</b>.</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-md mx-auto text-center">
      <h1 className="text-lg font-semibold mb-2">Install</h1>
      <p>If you didn’t see a prompt, try the button at the bottom.</p>
    </main>
  );
}