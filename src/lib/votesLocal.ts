import fs from "fs";
import path from "path";
import { queueVote } from "@/lib/offlineQueue";
import { trySyncVotes } from "@/lib/syncVotes";

const DATA_DIR = path.join(process.cwd(), "data");
const WORKERS_PATH = path.join(DATA_DIR, "workers.json");
const VOTES_PATH = path.join(DATA_DIR, "votes.json");

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WORKERS_PATH)) fs.writeFileSync(WORKERS_PATH, "[]", "utf-8");
  if (!fs.existsSync(VOTES_PATH)) fs.writeFileSync(VOTES_PATH, "[]", "utf-8");
}

export function readWorkers() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(WORKERS_PATH, "utf-8")) as Array<{
    code: string; project: "NBK"|"JP"; fullName: string; companyId: string;
  }>;
}

export function readVotes() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(VOTES_PATH, "utf-8")) as Array<any>;
}

export function appendVote(v: any) {
  ensureFiles();
  const list = readVotes();
  list.push(v);
  fs.writeFileSync(VOTES_PATH, JSON.stringify(list, null, 2), "utf-8");
}

const TZ = "America/Los_Angeles";

function fmt(now: Date, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).format(now);
}

export function dayKey(now = new Date()) {
  return `${fmt(now, { year:"numeric" })}-${fmt(now,{ month:"2-digit" })}-${fmt(now,{ day:"2-digit" })}`;
}
export function monthKey(now = new Date()) {
  return `${fmt(now, { year:"numeric" })}-${fmt(now,{ month:"2-digit" })}`;
}

function lastWednesdayOfMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth()+1, 0); // last day
  const back = (d.getDay() - 3 + 7) % 7; // 3 = Wed
  d.setDate(d.getDate() - back);
  d.setHours(0,0,0,0);
  return d;
}
export function isVotingOpen(now = new Date()) {
  return now < lastWednesdayOfMonth(now); // open from 1st up to (not incl) last Wed
}

export function countVoterToday(voterCode: string, now = new Date()) {
  const votes = readVotes();
  const dk = dayKey(now);
  return votes.filter(v => v.voterCode === voterCode && v.dayKey === dk).length;
}

export function countCompanyThisWindow(companyId: string, project: string, now = new Date()) {
  const votes = readVotes();
  const mk = monthKey(now);
  // window = 1st → last Wed (exclusive)
  // We store monthKey on all votes; monthKey rollovers automatically each month.
  return votes.filter(v => v.companyId === companyId && v.project === project && v.monthKey === mk).length;
}

async function castVote(voterCode: string, targetCode: string, project: "NBK" | "JP", memo = "") {
  // Try online first
  try {
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ voter_code: voterCode, target_code: targetCode, project, memo })
    });
    if (res.ok) return { ok: true, queued: false };
    // If server blocks (limits), surface message and don't queue
    const j = await res.json().catch(() => ({}));
    return { ok: false, error: j?.error || "Server rejected vote" };
  } catch {
    // Offline → queue locally and show success
    await queueVote({ voterCode, targetCode, project, memo });
    // Try to sync immediately (no-op if still offline)
    trySyncVotes();
    return { ok: true, queued: true };
  }
}