import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

const db = getDb();
const TZ = "America/Los_Angeles";
function fmt(now = new Date(), opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).format(now);
}
function dayKey(now = new Date()) {
  return `${fmt(now,{year:"numeric"})}-${fmt(now,{month:"2-digit"})}-${fmt(now,{day:"2-digit"})}`;
}
function monthKey(now = new Date()) {
  return `${fmt(now,{year:"numeric"})}-${fmt(now,{month:"2-digit"})}`;
}
function isVotingOpen(now = new Date()) {
  const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
  const back = (last.getDay() - 3 + 7) % 7;
  last.setDate(last.getDate() - back);
  last.setHours(0,0,0,0);
  return now < last;
}

export async function GET(_req: NextRequest) {
  const now = new Date();
  const dk = dayKey(now);
  const mk = monthKey(now);

  const [votesSnap, workersSnap, companiesSnap] = await Promise.all([
    db.collection("votes").where("dayKey","==", dk).get(),
    db.collection("workers").get(),
    db.collection("companies").get(),
  ]);

  const workers: Record<string, any> = {};
  workersSnap.forEach(d => { workers[d.id] = d.data(); });

  const companies: Record<string, string> = {};
  companiesSnap.forEach(d => { companies[d.id] = (d.data() as any).name; });
  const companyName = (id: string) => companies[id] || id;

  const todayRows = votesSnap.docs.map(d => {
    const v = d.data() as any;
    const voter = workers[v.voterCode] || {};
    const target = workers[v.targetCode] || {};
    return {
      time: v.createdAt,
      project: v.project,
      voterCode: v.voterCode,
      voterName: voter.fullName || "",
      voterCompany: companyName(voter.companyId || ""),
      targetCode: v.targetCode,
      targetName: target.fullName || "",
      targetCompany: companyName(target.companyId || ""),
    };
  });

  // month totals by project+company
  const monthSnap = await db.collection("votes").where("monthKey","==", mk).get();
  const totals: Record<string, { project: string; companyId: string; companyName: string; count: number }> = {};
  monthSnap.forEach(doc => {
    const v = doc.data() as any;
    const key = `${v.project}__${v.companyId}`;
    if (!totals[key]) totals[key] = {
      project: v.project,
      companyId: v.companyId,
      companyName: companyName(v.companyId),
      count: 0
    };
    totals[key].count += 1;
  });
  const monthTotals = Object.values(totals).sort((a,b) => a.project === b.project ? b.count - a.count : a.project.localeCompare(b.project));

  return NextResponse.json({
    ok: true,
    votingOpen: isVotingOpen(now),
    todayKey: dk,
    monthKey: mk,
    todayCount: todayRows.length,
    todayRows,
    monthTotals,
  });
}
