// src/components/InstallPromptButton.tsx
"use client";

import { useEffect, useState } from "react";

function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari
  // @ts-ignore
  if (typeof navigator.standalone === "boolean" && navigator.standalone) return true;
  return false;
}
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function InstallPromptButton() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [show, setShow] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const t = setTimeout(() => setShow(true), 1200); // iOS hint
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, []);

  if (installed || isStandalone()) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
      {deferred && (
        <div className="rounded-2xl shadow-lg bg-white border p-3">
          <div className="font-medium mb-2">Install app?</div>
          <p className="text-sm text-gray-600 mb-3">
            Add Token of Excellence to your home screen for quick access.
          </p>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded bg-black text-white flex-1"
              onClick={async () => {
                deferred.prompt();
                await deferred.userChoice; // accepted/dismissed
                setDeferred(null);
              }}
            >
              Install
            </button>
            <button className="px-3 py-2 rounded border flex-1" onClick={() => setDeferred(null)}>
              Not now
            </button>
          </div>
        </div>
      )}

      {!deferred && ios && show && (
        <div className="rounded-2xl shadow-lg bg-white border p-3">
          <div className="font-medium mb-2">Add to Home Screen</div>
          <p className="text-sm text-gray-600">
            In Safari: tap <b>Share</b> → <b>Add to Home Screen</b>.
          </p>
          <div className="mt-2 text-right">
            <button className="px-3 py-1 text-sm underline" onClick={() => setShow(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
