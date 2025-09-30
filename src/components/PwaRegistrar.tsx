// src/components/PwaRegistrar.tsx
"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
        // Optional: console.log("SW registered");
      } catch (err) {
        // Optional: console.error("SW failed", err);
      }
    };
    register();
  }, []);

  return null;
}
