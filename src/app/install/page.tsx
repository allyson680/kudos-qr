"use client";
import { useEffect, useState } from "react";

export default function InstallPage() {
  const [deferred, setDeferred] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setReady(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  return (
    <main className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold text-center">Install Tokens</h1>
      <p className="text-sm text-center">
        Add this app to your home screen for quick access.
      </p>
      <button
        disabled={!ready}
        onClick={async () => {
          if (!deferred) return;
          deferred.prompt();
          await deferred.userChoice;
          setDeferred(null);
          setReady(false);
        }}
        className="w-full py-3 rounded bg-black text-white disabled:opacity-40"
      >
        {ready ? "Install" : "Install (not available yet)"}
      </button>

      <div className="text-sm text-gray-500">
        <p><b>iPhone:</b> open in Safari → Share → Add to Home Screen.</p>
        <p><b>Android:</b> open in Chrome → “Install app” or More → Add to Home screen.</p>
      </div>
    </main>
  );
}