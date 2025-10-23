// src/components/FeedbackModal.tsx
"use client";

import { useState } from "react";

type Props = {
  onClose: () => void;
  project: string;
  voterCode: string;
  voterCompanyId?: string;
};

export default function FeedbackModal({ onClose, project, voterCode, voterCompanyId }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    // If the user never selected a rating, treat as "skip"
    if (!rating) return onClose();
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          voterCode,
          voterCompanyId: voterCompanyId || null,
          rating,
          note,
        }),
      });
      // Fire and forget UX — we don't need to show success/fail here
      onClose();
    } catch {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-medium">How’s this going?</h3>
        <p className="mt-1 text-sm text-gray-600">Quick 2-second rating. Comment optional.</p>

        {/* Simple 1–5 selector (circles; no stars to keep dependencies zero) */}
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={`h-10 w-10 rounded-full border text-sm ${
                rating >= n ? "bg-black text-white" : "bg-white"
              }`}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              {n}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything we should improve?"
          className="mt-3 w-full rounded-lg border p-2 text-sm"
          rows={3}
          maxLength={600}
        />

        <div className="mt-4 flex items-center justify-between">
          <button className="text-sm text-gray-600 underline" onClick={onClose}>
            Skip
          </button>
          <button
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
            onClick={submit}
            disabled={busy}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
