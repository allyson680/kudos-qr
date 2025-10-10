"use client";

import QRCode from "react-qr-code";
import { useMemo } from "react";

function originOr(env?: string) {
  if (typeof window !== "undefined") return window.location.origin;
  return env || "";
}

export default function InstallHandout() {
  const base = originOr(process.env.NEXT_PUBLIC_BASE_URL || "");
  const url = useMemo(() => `${base || ""}/install`, [base]);

  return (
    <main className="mx-auto max-w-4xl p-6 print:p-4">
      <section className="rounded-2xl border shadow-sm p-6 print:shadow-none">
        <header className="text-center space-y-2 mb-6">
          <h1 className="text-3xl font-extrabold">Add “Token of Excellence”</h1>
          <p className="text-gray-600">
            Scan the QR and follow the quick steps below to put the app on your home screen.
          </p>
        </header>

        <div className="grid md:grid-cols-[1fr,1fr] gap-8 items-center">
          {/* QR block */}
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-xl border">
              <QRCode value={url} size={220} />
            </div>
            <div className="font-mono text-sm break-all">{url}</div>
            <div className="text-xs text-gray-500">
              Tip: If the QR opens inside another app, choose <b>Open in browser</b>.
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-6">
            <div className="rounded-xl border p-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>🤖 Android</span>
              </h2>
              <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm text-gray-800">
                <li>Open in <b>Chrome</b>.</li>
                <li>Tap <b>Install</b> when prompted.</li>
                <li>If no prompt: menu <b>⋮ → Install app</b>.</li>
              </ol>
            </div>

            <div className="rounded-xl border p-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>🍎 iPhone / iPad</span>
              </h2>
              <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm text-gray-800">
                <li>Open in <b>Safari</b>.</li>
                <li>Tap <b>Share</b> (□↑).</li>
                <li>Select <b>Add to Home Screen</b>.</li>
              </ol>
              <p className="text-xs text-gray-500 mt-2">
                If you don’t see it, scroll down and tap <b>Edit Actions…</b>, then add it.
              </p>
            </div>

            <div className="rounded-xl border p-4 bg-emerald-50">
              <h3 className="font-semibold">Why install?</h3>
              <ul className="list-disc pl-5 mt-2 text-sm text-emerald-900">
                <li>Fast access right from your home screen</li>
                <li>Full-screen experience</li>
                <li>No App Store account needed</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Print helpers */}
      <style jsx global>{`
        @media print {
          @page { margin: 0.5in; }
          a[href]:after { content: ""; }
        }
      `}</style>
    </main>
  );
}
