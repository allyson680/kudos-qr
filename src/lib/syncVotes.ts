// src/lib/syncVotes.ts
// Minimal stub so the app builds and we can iterate.
// You can call trySyncVotes() with no args to "flush", or pass a vote to send now.

type Vote = {
  voterCode: string;
  targetCode: string;
  voteType?: "token" | "goodCatch";
};

export async function trySyncVotes(vote?: Vote): Promise<void> {
  try {
    if (vote) {
      // Send a single vote now
      await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vote),
      });
    }
    // Later we can hook this up to your IndexedDB queue and flush pending votes.
  } catch {
    // Swallow errors for now (offline etc.). We'll enhance this later.
  }
}
