// src/app/vote/page.tsx
import { Suspense } from "react";
import VotePageClient from "./VotePageClient";

// Optional: if you fetch on client and don't want static rendering/caching
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="p-4 max-w-md mx-auto">
          <p className="text-sm text-gray-600">Loading…</p>
        </main>
      }
    >
      <VotePageClient />
    </Suspense>
  );
}
