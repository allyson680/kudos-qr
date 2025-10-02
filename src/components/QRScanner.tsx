"use client";
import { useEffect, useRef, useState } from "react";

let QrScannerLib: typeof import("qr-scanner").default | null = null;

type Props = {
  onScan: (text: string | null) => void;
  onError?: (err: Error) => void;
  /** If true, try to start camera on mount. If the browser blocks it, user can tap to start. */
  autoStart?: boolean;
};

export default function QRScanner({ onScan, onError, autoStart = true }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function startScanner() {
    if (starting || started) return;
    setStarting(true);
    setErrMsg(null);

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

      if (!videoRef.current || !QrScannerLib) return;

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Tear down an old scanner if any
      try { scannerRef.current?.stop(); scannerRef.current?.destroy?.(); } catch {}

      const scanner = new QrScannerLib(
        videoRef.current,
        (res: any) => {
          const text = typeof res === "string" ? res : res?.data ?? null;
          if (text) {
            onScan(text);
          }
        },
        { returnDetailedScanResult: true }
      );
      scannerRef.current = scanner;
      await scanner.start();
      setStarted(true);
    } catch (e: any) {
      const msg = e?.message || "Camera error. You can type the code instead.";
      setErrMsg(msg);
      onError?.(e);
      setStarted(false);
    } finally {
      setStarting(false);
    }
  }

  function stopScanner() {
    try {
      scannerRef.current?.stop();
      scannerRef.current?.destroy?.();
    } catch {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStarted(false);
  }

  useEffect(() => {
    if (autoStart) startScanner();
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div className="aspect-[4/3] w-full bg-black rounded overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
      </div>

      {/* Overlay: visible until the scanner is actually running */}
      {!started && !starting && (
        <button
          type="button"
          onClick={startScanner}
          className="absolute inset-0 flex items-center justify-center rounded bg-black/60 text-white text-sm"
          aria-label="Tap to start scanner"
        >
          Tap to scan
        </button>
      )}

      {/* Starting spinner */}
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50 text-white text-sm">
          Starting camera…
        </div>
      )}

      {/* Error and retry */}
      {errMsg && (
        <div className="mt-2 text-sm">
          <p className="text-red-500">{errMsg}</p>
          <button
            type="button"
            onClick={startScanner}
            className="mt-1 px-3 py-1 rounded bg-black text-white"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
