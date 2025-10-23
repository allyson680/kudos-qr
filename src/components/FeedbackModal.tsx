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
    // Skip if no rating selected
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
    } catch (e) {
      console.warn("Feedback error", e);
    } finally {
      setBusy(false);
      onClose(); // ✅ always close
    }
  }

  return (
    // Backdrop itself closes on click
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Card stops the click from bubbling to the backdrop */}
      <div
        className="w-full max-w-sm rounded-2xl bg-neutral-900 text-white p-6 shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-green-400">How’s this going?</h3>
        <p className="mt-1 text-sm text-gray-300">Quick 2-second rating. Comment optional.</p>

        <div className="mt-4 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`h-10 w-10 rounded-full border font-medium transition ${
                rating >= n
                  ? "bg-green-500 border-green-400 text-white"
                  : "bg-neutral-800 border-neutral-600 text-gray-300"
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
          className="mt-4 w-full rounded-lg border border-neutral-700 bg-neutral-800 text-gray-100 placeholder:text-gray-400 p-2 text-sm focus:ring-2 focus:ring-green-400"
          rows={3}
          maxLength={600}
        />

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            className="text-sm text-gray-300 underline hover:text-white"
            onClick={onClose}
            disabled={busy}
          >
            Skip
          </button>
          <button
            type="button"
            className="rounded-lg bg-green-600 px-4 py-2 text-white font-semibold hover:bg-green-500 disabled:opacity-50"
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
