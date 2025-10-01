import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const db = getDb();
const TZ = "America/Los_Angeles";

function fmt(now = new Date(), opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).format(now);
}
function dayKey(now = new Date()) {
  return `${fmt(now, { year: "numeric" })}-${fmt(now, { month: "2-digit" })}-${fmt(now, { day: "2-digit" })}`;
}
function monthKey(now = new Date()) {
  return `${fmt(now, { year: "numeric" })}-${fmt(now, { month: "2-digit" })}`;
}
function isVotingOpen(now = new Date()) {
  // Open until the last Wednesday of the month at 00:00 local TZ
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const back = (last.getDay() - 3 + 7) % 7; // 3 = Wed
  last.setDate(last.getDate() - back);
  last.setHours(0, 0, 0, 0);
  return now < last;
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
  try {
    const now = new Date();
    const dk = dayKey(now);
    const mk = monthKey(now);

    const [votesSnap, workersSnap, companiesSnap, monthSnap] = await Promise.all([
      db.collection("votes").where("dayKey", "==", dk).get(),
      db.collection("workers").get(),
      db.collection("companies").get(),
      db.collection("votes").where("monthKey", "==", mk).get(),
    ]);

    // Maps
    const workers: Record<string, any> = {};
    workersSnap.forEach((d) => {
      workers[d.id] = d.data();
    });

    const companies: Record<string, string> = {};
    companiesSnap.forEach((d) => {
      companies[d.id] = (d.data() as any).name || d.id;
    });
    const companyName = (id: string) => (id ? companies[id] || id : "—");

    // Today’s rows
    const todayRows = votesSnap.docs.map((d) => {
      const v = d.data() as any;
      const voter = workers[v.voterCode] || {};
      const target = workers[v.targetCode] || {};

      return {
        time: toIso(v.createdAt),               // <-- ISO for the UI
        project: v.project,
        voterCode: v.voterCode,
        voterName: voter.fullName || "",
        voterCompany: companyName(voter.companyId || v.companyId || ""),
        targetCode: v.targetCode,
        targetName: target.fullName || "",
        targetCompany: companyName(target.companyId || ""),
      };
    });

    // Month totals (by project + company)
    const totals: Record<
      string,
      { project: string; companyId: string; companyName: string; count: number }
    > = {};

    monthSnap.forEach((doc) => {
      const v = doc.data() as any;
      // Prefer companyId saved on the vote; fall back to voter's company from workers map
      const voter = workers[v.voterCode] || {};
      const cid: string = v.companyId || voter.companyId || "";
      const key = `${v.project}__${cid}`;
      if (!totals[key]) {
        totals[key] = {
          project: v.project,
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
