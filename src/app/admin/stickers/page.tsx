"use client";

import { useMemo, useState } from "react";
import QRCode from "react-qr-code";

function pad(n: number, width = 3) {
  return String(n).padStart(width, "0");
}

export default function StickerSheet() {
  const [prefix, setPrefix] = useState<"NBK" | "JP">("NBK");
  const [start, setStart] = useState<number>(1);
  const [end, setEnd] = useState<number>(300);
  const [width, setWidth] = useState<number>(2.0); // inches per sticker (approx)
  const [gap, setGap] = useState<number>(0.25);    // inches gap
  const [useCurrentOrigin, setUseCurrentOrigin] = useState<boolean>(true);
  const [baseUrl, setBaseUrl] = useState<string>("https://tokens-of-excellence.vercel.app");

  const labels = useMemo(() => {
    const arr: { code: string; url: string }[] = [];
    const origin =
      useCurrentOrigin && typeof window !== "undefined"
        ? window.location.origin
        : baseUrl;

    const from = Math.min(start, end);
    const to = Math.max(start, end);
    for (let i = from; i <= to; i++) {
      const code = `${prefix}${pad(i)}`;
      const url = `${origin}/k/${code}`; // or /vote?voter=${code}
      arr.push({ code, url });
    }
    return arr;
  }, [prefix, start, end, baseUrl, useCurrentOrigin]);

  const ppi = 96;
  const itemSize = Math.round(width * ppi);
  const itemGap = Math.round(gap * ppi);

  return (
    <main className="p-4 print:p-0 max-w-6xl mx-auto">
      <header className="print:hidden mb-4 flex flex-wrap items-end gap-3">
        <h1 className="text-xl font-semibold">Sticker QR Sheet</h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => window.print()} className="px-3 py-2 rounded bg-black text-white">
            Print / Save PDF
          </button>
        </div>
      </header>

      <section className="print:hidden grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <label className="block">
          <div className="text-sm text-gray-500">Prefix</div>
          <select
            className="w-full border rounded p-2"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value as "NBK" | "JP")}
          >
            <option value="NBK">NBK</option>
            <option value="JP">JP</option>
          </select>
        </label>
        <label className="block">
          <div className="text-sm text-gray-500">Start #</div>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={start}
            min={1}
            onChange={(e) => setStart(parseInt(e.target.value || "1", 10))}
          />
        </label>
        <label className="block">
          <div className="text-sm text-gray-500">End #</div>
          <input
            type="number"
            className="w-full border rounded p-2"
            value={end}
            min={start}
            onChange={(e) => setEnd(parseInt(e.target.value || "1", 10))}
          />
        </label>
        <label className="block">
          <div className="text-sm text-gray-500">Sticker width (inches)</div>
          <input
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={width}
            onChange={(e) => setWidth(parseFloat(e.target.value || "2"))}
          />
        </label>
        <label className="block">
          <div className="text-sm text-gray-500">Gap (inches)</div>
          <input
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={gap}
            onChange={(e) => setGap(parseFloat(e.target.value || "0.25"))}
          />
        </label>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useCurrentOrigin}
              onChange={(e) => setUseCurrentOrigin(e.target.checked)}
            />
            Use current site origin
          </label>
          {!useCurrentOrigin && (
            <input
              className="w-full border rounded p-2"
              placeholder="https://your-domain.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          )}
          <div className="text-xs text-gray-500">
            QR links look like:{" "}
            <code>
              {(typeof window !== "undefined" && useCurrentOrigin
                ? window.location.origin
                : baseUrl)}/k/NBK001
            </code>
          </div>
        </div>
      </section>

      <section
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${itemSize}px, 1fr))`,
          gap: itemGap,
        }}
      >
        {labels.map(({ code, url }) => (
          <div
            key={code}
            className="flex flex-col items-center justify-center border rounded p-2 break-inside-avoid"
            style={{ width: itemSize, height: itemSize + 40 }}
          >
            <div className="bg-white p-1 rounded" style={{ width: itemSize - 16, height: itemSize - 16 }}>
              <QRCode
                value={url}
                size={itemSize - 18}
                style={{ width: "100%", height: "100%" }}
                viewBox={`0 0 ${itemSize - 18} ${itemSize - 18}`}
              />
            </div>
            <div className="mt-2 font-mono text-sm">{code}</div>
          </div>
        ))}
      </section>

      <style jsx global>{`
        @media print {
          @page { margin: 0.25in; }
          header, section.print\\:hidden { display: none !important; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
