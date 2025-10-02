"use client";

import QRScanner from "@/Company/QRScanner";

import { trySyncVotes } from "@/lib/syncVotes";
import { useState } from "react";

export default function KudosScannerPage() {
  const [lastScan, setLastScan] = useState<string | null>(null);

  const handleScan = async (data: string | null) => {
    if (!data) return;
    setLastScan(data);
    try {
      const vote = JSON.parse(data);
      await trySyncVotes(vote);
    } catch (e) {
      // Optionally handle invalid QR data here
      console.error("Invalid QR data, not a valid Vote object.", e);
    }
  };

  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold mb-4">Scan a Kudos QR Code</h1>
      <QRScanner onScan={handleScan} />
      {lastScan && (
        <p className="mt-4 text-green-600">✅ Last scan: {lastScan}</p>
      )}
    </main>
  );
}