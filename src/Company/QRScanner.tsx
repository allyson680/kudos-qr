"use client";

import { useCallback, useEffect, useRef, useState } from "react";

let QrScannerLib: typeof import("qr-scanner").default | null = null;

type Props = {
  onScan: (result: string | null) => void;
  onError?: (err: Error) => void;
  autoStart?: boolean; // default true
  className?: string;
};

export default function QRScanner({
  onScan,
  onError,
  autoStart = true,
  className = "",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannedRef = useRef(false);

  const [active, setActive] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const stop = useCallback(() => {
    try {
      scannerRef.current?.stop();
      scannerRef.current?.destroy?.();
    } catch {}
    scannerRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setErrMsg(null);
    scannedRef.current = false;
    try {
      if (!QrScannerLib) {
        const mod = await import("qr-scanner");
        QrScannerLib = mod.default;
        QrScannerLib.WORKER_PATH = new URL(
          "qr-scanner/qr-scanner-worker.min.js",
          import.meta.url
        ).toString();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const s = new QrScannerLib(
        videoRef.current,
        (res: any) => {
          if (scannedRef.current) return;
          const text = typeof res === "string" ? res : res?.data ?? null;
          if (!text) return;
          scannedRef.current = true;
          onScan(text);
        },
        { returnDetailedScanResult: true }
      );
      scannerRef.current = s;
      await s.start();
      setActive(true);
    } catch (e: any) {
      setErrMsg(
        e?.message || "Camera unavailable. Tap to try again or type the code."
      );
      onError?.(e);
      setActive(false);
    }
  }, [onScan, onError]);

  useEffect(() => {
    if (autoStart) start();
    return () => stop();
  }, [autoStart, start, stop]);

  return (
    <div
      className={`relative rounded-lg overflow-hidden border border-neutral-800 bg-black ${className}`}
    >
      <div className="aspect-[4/3] w-full">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
      </div>

      {/* Tap-to-scan overlay when not active or on error */}
      {!active && (
        <button
          type="button"
          onClick={start}
          className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/50 backdrop-blur-sm"
        >
          <div className="px-4 py-2 rounded-full border border-white/30 bg-white/10">
            Tap to scan
          </div>
        </button>
      )}

      {/* Corner markers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-2 top-2 w-6 h-6 border-t-2 border-l-2 border-white/70 rounded-tl" />
        <div className="absolute right-2 top-2 w-6 h-6 border-t-2 border-r-2 border-white/70 rounded-tr" />
        <div className="absolute left-2 bottom-2 w-6 h-6 border-b-2 border-l-2 border-white/70 rounded-bl" />
        <div className="absolute right-2 bottom-2 w-6 h-6 border-b-2 border-r-2 border-white/70 rounded-br" />
      </div>

      {/* Small error hint */}
      {errMsg && (
        <div className="absolute bottom-1 left-1 right-1 text-center text-xs text-red-400 bg-black/60 rounded px-2 py-1">
          {errMsg}
        </div>
      )}
    </div>
  );
}
