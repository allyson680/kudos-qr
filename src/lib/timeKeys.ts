import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { getProjectFromCode } from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Time zone (configurable). In Vercel set env var VOTE_TZ if you want local time.
const TZ = process.env.VOTE_TZ || "UTC";

// Format helpers (all keyed in TZ, stable for day/month grouping)
function fmt(now = new Date(), opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).format(now);
}
function dayKey(now = new Date()) {
  return `${fmt(now, { year: "numeric" })}-${fmt(now, { month: "2-digit" })}-${fmt(
    now,
    { day: "2-digit" }
  )}`;
}
function monthKey(now = new Date()) {
  return `${fmt(now, { year: "numeric" })}-${fmt(now, { month: "2-digit" })}`;
}

/**
 * Voting open policy: open the entire month (1st 00:00 TZ → last day 23:59:59 TZ).
 * No blackout dates inside the month.
 */
function isVotingOpen(now = new Date()) {
  const y = Number(fmt(now, { year: "numeric" }));
  const m = Number(fmt(now, { month: "2-digit" })) - 1; // 0-based
  const d = Number(fmt(now, { day: "2-digit" }));
  const lastDay = new Date(y, m + 1, 0).getDate();
  return d >= 1 && d <= lastDay;
}

// Safely turn Firestore Timestamp/Date/string into ISO string
function toIso(val: any): string {
  try {
    if (val?.toDate) return val.toDate().toISOString();
    const d = new Date(val);
    return Number.isNaN(+d) ? "" : d.toISOString();
  } catch {
    return "";
  }
}

export async function GET(_req: NextRequest) {
  const db = getDb();
  try {
    const now = new Date();
    const dk = dayKey(now);
    const mk = monthKey(now);

    // Pull today’s votes, all workers/companies, and this month’s votes in parallel
    const [votesSnap, workersSnap, companiesSnap, monthSnap] = await Promise.all([
      db.collection("votes").where("dayKey", "==", dk).get(),
      db.collection("workers").get(),
      db.collection("companies").get(),
      db.collection("votes").where("monthKey", "==", mk).get(),
    ]);

    // Index workers for fast joins
    const workers: Record<string, any> = {};
    workersSnap.forEach((d) => {
      workers[d.id] = d.data();
    });

    // Index companies (id -> name)
    const companies: Record<string, string> = {};
    companiesSnap.forEach((d) => {
      companies[d.id] = (d.data() as any).name || d.id;
    });
    const companyName = (id?: string) => (id ? companies[id] || id : "—");

    // Today’s rows
    const todayRows = votesSnap.docs.map((d) => {
      const v = d.data() as any;
      const voter = workers[v.voterCode] || {};
      const target = workers[v.targetCode] || {};
      const project = v.project || getProjectFromCode(v.voterCode || target.code || "");

      return {
        time: toIso(v.createdAt),
        project,
        voterCode: v.voterCode,
        voterName: voter.fullName || "",
        voterCompany: companyName(v.voterCompanyId || voter.companyId || v.companyId),
        targetCode: v.targetCode,
        targetName: target.fullName || "",
        targetCompany: companyName(v.targetCompanyId || target.companyId),
      };
    });

    // This month’s totals by (project, voterCompany)
    const totals: Record<
      string,
      { project: string; companyId: string; companyName: string; count: number }
    > = {};

    monthSnap.forEach((doc) => {
      const v = doc.data() as any;
      const voter = workers[v.voterCode] || {};
      const project = v.project || getProjectFromCode(v.voterCode || "");
      // Prefer voterCompanyId saved on the vote; fall back to voter.companyId
      const cid: string = v.voterCompanyId || v.companyId || voter.companyId || "";
      const key = `${project}__${cid}`;
      if (!totals[key]) {
        totals[key] = {
          project,
          companyId: cid,
          companyName: companyName(cid),
          count: 0,
        };
      }
      totals[key].count += 1;
    });

    const monthTotals = Object.values(totals).sort((a, b) =>
      a.project === b.project ? b.count - a.count : a.project.localeCompare(b.project)
    );

    return NextResponse.json({
      ok: true,
      votingOpen: isVotingOpen(now),
      todayKey: dk,
      monthKey: mk,
      todayCount: todayRows.length,
      todayRows,
      monthTotals,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
