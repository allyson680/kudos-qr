"use client";

import { useMemo } from "react";
import QRCode from "react-qr-code";

export default function AppQrPoster() {
  const url = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/install`;
    }
    // fallback for SSR; replace with your deployed domain if you want
    return "https://your-domain.com/install";
  }, []);

  return (
    <main className="p-6 print:p-0 max-w-xl mx-auto">
      <header className="print:hidden mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">App Install Poster</h1>
        <button
          onClick={() => window.print()}
          className="px-3 py-2 rounded bg-black text-white"
        >
          Print / Save PDF
        </button>
      </header>

      <section className="border rounded p-4 flex flex-col items-center">
        <div className="bg-white p-3 rounded">
          {/* big, clean QR */}
          <QRCode value={url} size={512} style={{ width: 360, height: 360 }} />
        </div>
        <div className="mt-3 font-mono text-lg">
          {url.replace(/^https?:\/\//, "")}
        </div>
        <p className="mt-2 text-sm text-center print:hidden">
          Scan to open the install page and add the app to your home screen.
        </p>
      </section>

      <style jsx global>{`
        @media print {
          @page { margin: 0.25in; }
          header { display: none !important; }
        }
      `}</style>
    </main>
  );
}
