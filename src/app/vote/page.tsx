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
      <main className="p-4 max-w-md mx-auto space-y-4">
        <h1 className="text-4xl font-extrabold text-center mt-4 bg-gradient-to-r from-green-400 via-emerald-500 to-green-300 bg-clip-text text-transparent animate-shimmer">
          Tokens of Excellence
        </h1>
        <VotePageClient />
      </main>
    </Suspense>
  );
}
