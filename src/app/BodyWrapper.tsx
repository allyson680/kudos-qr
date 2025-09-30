"use client";

import { useEffect } from "react";
import { trySyncVotes } from "@/lib/syncVotes";

export default function BodyWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    trySyncVotes();
    const onOnline = () => trySyncVotes();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return <>{children}</>;
}
