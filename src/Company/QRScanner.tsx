"use client";
import { useCallback, useEffect, useRef, useState } from "react";

let QrScannerLib: typeof import("qr-scanner").default | null = null;

type Props = {
  onScan: (result: string | null) => void;
  onError?: (err: Error) => void;
};

export default function QRScanner({ onScan, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasScannedRef = useRef(false);

  const [status, setStatus] =
    useState<"idle" | "starting" | "ready" | "error" | "paused">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const stop = useCallback(() => {
    try {
      scannerRef.current?.stop();
      scannerRef.current?.destroy?.();
    } catch {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setMessage(null);
    setStatus("starting");
    hasScannedRef.current = false;

    try {
      if (!QrScannerLib) {
        const mod = await import("qr-scanner");
        QrScannerLib = mod.default;
        // Worker path for Next bundling
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
      await videoRef.current.play(); // may require user gesture on iOS

      const scanner = new QrScannerLib(
        videoRef.current,
        (res: any) => {
          if (hasScannedRef.current) return;
          const text = typeof res === "string" ? res : res?.data ?? null;
          if (text) {
            hasScannedRef.current = true;
            setStatus("paused");
            onScan(text);
          }
        },
        { returnDetailedScanResult: true }
      );
      scannerRef.current = scanner;
      await scanner.start();
      setStatus("ready");
    } catch (e: any) {
      setStatus("error");
      setMessage(
        e?.message ||
          "Camera error. Tap to try again, or type the code manually."
      );
      onError?.(e);
    }
  }, [onScan, onError]);

  useEffect(() => {
    start(); // attempt auto-start
    return () => stop();
  }, [start, stop]);

  const showTapOverlay = status !== "ready";

  return (
    <div className="relative w-full rounded-lg overflow-hidden bg-black">
      {/* Video */}
      <div className="aspect-[4/3] w-full">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
      </div>

      {/* Framing reticle */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="w-3/4 max-w-sm aspect-square rounded-2xl ring-2 ring-white/50" />
      </div>

      {/* Tap overlay (appears until camera is 'ready') */}
      {showTapOverlay && (
        <button
          type="button"
          className="absolute inset-0 grid place-items-center bg-black/40 text-white"
          onClick={start}
        >
          <div className="px-4 py-2 rounded-full bg-white/10 backdrop-blur border border-white/30">
            {status === "starting" ? "Starting…" : "Tap to Scan"}
          </div>
        </button>
      )}

      {/* Status / error message */}
      {message && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/90 bg-black/60 px-2 py-1 rounded">
          {message}
        </div>
      )}
    </div>
  );
}
