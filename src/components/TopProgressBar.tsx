"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0); // 0..100
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // Imperative helpers so you can call from elsewhere if needed
  (globalThis as any).__topbar_start = () => start();
  (globalThis as any).__topbar_done = () => finish(true);

  function cancelTimers() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
  }

  function start() {
    cancelTimers();
    setVisible(true);
    setWidth(2);
    // ease toward ~80% while “loading”
    const tick = () => {
      setWidth(prev => (prev < 80 ? prev + Math.max(0.5, (80 - prev) * 0.05) : prev));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function finish(immediate = false) {
    cancelTimers();
    if (immediate) {
      setWidth(100);
      timerRef.current = window.setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 250);
      return;
    }
    // smooth finish
    setWidth(100);
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 350);
  }

  // Detect route/search changes (App Router)
  useEffect(() => {
    // start immediately on path/search change
    start();
    // complete after a short grace (content will be ready or Suspense will take over)
    const t = window.setTimeout(() => finish(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams?.toString()]);

  // Also finish when the page regains focus (fast navs/back/forward)
  useEffect(() => {
    const onFocus = () => finish();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Optional: finish after any full load (hard nav)
  useEffect(() => {
    const onLoad = () => finish(true);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-[9999] h-[3px]">
      <div
        className="h-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-topbar-sheen"
        style={{ width: `${width}%`, transition: "width 120ms ease-out" }}
      />
    </div>
  );
}
