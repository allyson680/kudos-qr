"use client";
import { openDB } from "idb";

const DB_NAME = "kudos-offline";
const STORE = "pending-votes";

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) { d.createObjectStore(STORE, { keyPath: "id" }); }
  });
}

export async function queueVote(vote: {
  voterCode: string; targetCode: string; project: "NBK" | "JP";
  memo?: string; ts?: number;
}) {
  const _db = await db();
  const id = `${vote.voterCode}-${vote.targetCode}-${Date.now()}`;
  await _db.put(STORE, { id, ts: Date.now(), ...vote });
}

export async function getPending() {
  const _db = await db();
  return await _db.getAll(STORE);
}

export async function removePending(id: string) {
  const _db = await db();
  await _db.delete(STORE, id);
}
