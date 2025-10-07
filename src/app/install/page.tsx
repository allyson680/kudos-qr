"use client";

import InstallPromptButton from "@/components/InstallPromptButton";

export default function InstallPage() {
  return (
    <main className="p-6 max-w-md mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-center">Install Token Vote</h1>

      <p className="text-sm">
        This adds a shortcut to your home screen so it feels like an app.
      </p>

      <div className="rounded border p-3 space-y-2">
        <h2 className="font-semibold">iPhone / iPad (Safari)</h2>
        <ol className="list-decimal ml-5 text-sm">
          <li>Tap the <b>Share</b> button.</li>
          <li>Choose <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>.</li>
        </ol>
      </div>

      <div className="rounded border p-3 space-y-2">
        <h2 className="font-semibold">Android (Chrome)</h2>
        <ol className="list-decimal ml-5 text-sm">
          <li>Open the ⋮ menu.</li>
          <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li>
          <li>Confirm.</li>
        </ol>
      </div>

      {/* Optional one-tap install button for browsers that support beforeinstallprompt */}
      <InstallPromptButton />

      <a href="/"
         className="block text-center px-4 py-2 rounded bg-black text-white">
        Open the app
      </a>
    </main>
  );
}
