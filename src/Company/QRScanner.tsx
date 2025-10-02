"use client";

import { useEffect, useRef, useState, useCallback } from "react";

let QrScannerLib: typeof import("qr-scanner").default | null = null;

type Props = {
  onScan: (result: string | null) => void;
  onError?: (err: Error) => void;
  /** Try to start immediately; if blocked, we’ll show Tap-to-scan */
  autoStart?: boolean;
};

export default function QRScanner({ onScan, onError, autoStart = true }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<any>(null);
  const scannedOnceRef = useRef(false);

  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const startScanner = useCallback(async () => {
    if (starting || started) return;
    setStarting(true);
    setErrMsg(null);

    try {
      if (!QrScannerLib) {
        const mod = await import("qr-scanner");
        QrScannerLib = mod.default;
        // worker path for bundlers
        QrScannerLib.WORKER_PATH = new URL(
          "qr-scanner/qr-scanner-worker.min.js",
          import.meta.url
        ).toString();
      }
      if (!videoRef.current || !QrScannerLib) return;

      // Clean any previous instance
      try {
        await scannerRef.current?.stop();
        scannerRef.current?.destroy?.();
      } catch {}

      scannedOnceRef.current = false;

      const scanner = new QrScannerLib(
        videoRef.current,
        (res: any) => {
          if (scannedOnceRef.current) return;
          const text = typeof res === "string" ? res : res?.data ?? null;
          if (text) {
            scannedOnceRef.current = true;
            onScan(text);
          }
        },
        { returnDetailedScanResult: true, preferredCamera: "environment" }
      );
      scannerRef.current = scanner;

      await scanner.start(); // requests camera
      setStarted(true);
    } catch (e: any) {
      // If browser blocked auto start, show Tap-to-scan
      const msg =
        e?.message ||
        "Camera blocked. Tap to scan or allow camera access in your browser.";
      setErrMsg(msg);
      onError?.(e);
      setStarted(false);
    } finally {
      setStarting(false);
    }
  }, [onScan, onError, starting, started]);

  useEffect(() => {
    if (autoStart) startScanner();
    return () => {
      try {
        scannerRef.current?.stop();
        scannerRef.current?.destroy?.();
      } catch {}
    };
  }, [autoStart, startScanner]);

  return (
    <div className="relative w-full rounded overflow-hidden">
      <div className="aspect-[4/3] bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />
      </div>

      {/* Tap-to-scan overlay if not started */}
      {!started && (
        <button
          type="button"
          onClick={startScanner}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm font-medium"
        >
          {starting ? "Starting…" : "Tap to scan"}
        </button>
      )}

      {errMsg && (
        <p className="mt-1 text-xs text-red-600 text-center">{errMsg}</p>
      )}
    </div>
  );
}
