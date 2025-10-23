// src/components/FeedbackModal.tsx
"use client";

import { useState } from "react";

type Props = {
  onClose: () => void;
  project: string;
  voterCode: string;
  voterCompanyId?: string | null;
};

export default function FeedbackModal({
  onClose,
  project,
  voterCode,
  voterCompanyId,
}: Props) {
  const [rating, setRating] = useState<number>(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    // If no rating, treat as skip
    if (!rating) return onClose();
    setBusy(true);
    try {
      await fetch("/api/feedback", {
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
    } catch {
      // ignore
    } finally {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl text-gray-900">
        <h3 className="text-lg font-semibold">How’s this going?</h3>
        <p className="mt-1 text-sm text-gray-600">
          Quick 2-second rating. Comment optional.
        </p>

        {/* 1–5 buttons */}
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`h-10 w-10 rounded-full border text-sm transition
                ${rating >= n ? "bg-black text-white" : "bg-white text-gray-900"}`}
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
          className="mt-3 w-full rounded-lg border p-2 text-sm placeholder:text-gray-500"
          rows={3}
          maxLength={600}
        />

        <div className="mt-4 flex items-center justify-between">
          <button type="button" className="text-sm text-gray-600 underline" onClick={onClose}>
            Skip
          </button>
          <button
            type="button"
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
