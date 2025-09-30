"use client";
import { useEffect, useRef, useState } from "react";

let QrScannerLib: typeof import("qr-scanner").default | null = null;

export default function QRScanner({
  onScan,
  onError,
}: {
  onScan: (result: string | null) => void;
  onError?: (err: Error) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<any>(null);
  const hasScannedRef = useRef(false);              // NEW
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    hasScannedRef.current = false;                  // NEW
    let stopped = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        if (!QrScannerLib) {
          const mod = await import("qr-scanner");
          QrScannerLib = mod.default;
          QrScannerLib.WORKER_PATH = new URL(
            "qr-scanner/qr-scanner-worker.min.js",
            import.meta.url
          ).toString();
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (stopped || !videoRef.current || !QrScannerLib) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const scanner = new QrScannerLib(
          videoRef.current,
          (res: any) => {
            if (hasScannedRef.current) return;      // NEW
            const text = typeof res === "string" ? res : res?.data ?? null;
            if (text) {
              hasScannedRef.current = true;         // NEW
              onScan(text);
            }
          },
          { returnDetailedScanResult: true }
        );
        scannerRef.current = scanner;
        await scanner.start();
      } catch (e: any) {
        const msg =
          e?.message || "Camera error. You can type the code in the input on the page.";
        setErrMsg(msg);
        onError?.(e);
      }
    })();

    return () => {
      stopped = true;
      hasScannedRef.current = false;                // NEW
      try {
        scannerRef.current?.stop();
        scannerRef.current?.destroy?.();
      } catch {}
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onScan, onError]);

  return (
    <div className="space-y-2">
      <div className="aspect-[4/3] w-full bg-black rounded overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
      </div>
      {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}
    </div>
  );
}
