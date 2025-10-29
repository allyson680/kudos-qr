// src/app/api/admin/summary/route.ts
import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getCurrentDayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function isValidYM(ym: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

function toRow(d: FirebaseFirestore.QueryDocumentSnapshot): any {
  const v = d.data() as any;
  const ts =
    v?.createdAt?.toDate?.() ??
    v?.createdAt ??
    v?.time ??
    v?.voteTimestamp?.toDate?.() ??
    new Date();
  return {
    id: d.id,
    time: new Date(ts).toISOString(),
    project: v.project,
    voterCode: v.voterCode,
    voterName: v.voterName,
    voterCompany: v.voterCompanyId ?? v.voterCompany, // support either
    targetCode: v.targetCode,
    targetName: v.targetName,
    targetCompany: v.targetCompanyId ?? v.targetCompany,
    voteType: v.voteType,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawYm = searchParams.get("month") || getCurrentYM();
    const ym = isValidYM(rawYm) ? rawYm : getCurrentYM();

    const todayKey = getCurrentDayKey();
    const monthKey = ym;

    // --- TODAY: equality on dayKey + order by doc id to avoid composite index
    const todaySnap = await db
      .collection("votes")
      .where("dayKey", "==", todayKey)
      .orderBy("__name__", "desc")
      .limit(500)
      .get();
    const todayRows = todaySnap.docs.map(toRow);

    // --- MONTH: equality on monthKey + order by doc id to avoid composite index
    const monthSnap = await db
      .collection("votes")
      .where("monthKey", "==", ym)
      .orderBy("__name__", "desc")
      .limit(2000)
      .get();
    const monthRows = monthSnap.docs.map(toRow);

    // --- GROUP totals by voterCompany (change to targetCompany if you prefer)
    type Tot = { companyId: string; companyName: string; project: string; count: number };
    const totalsMap = new Map<string, Tot>();
    for (const r of monthRows) {
      const companyName = r.voterCompany ?? "(Unknown)";
      const project = r.project ?? "";
      const key = `${project}|${companyName}`;
      const cur = totalsMap.get(key) || {
        companyId: companyName,
        companyName,
        project,
        count: 0,
      };
      cur.count += 1;
      totalsMap.set(key, cur);
    }
    const monthTotals = Array.from(totalsMap.values()).sort((a, b) => b.count - a.count);

    // plug your real voting-window logic if you have one
    const votingOpen = true;

    return NextResponse.json({
      votingOpen,
      todayKey,
      monthKey,
      todayRows,
      monthRows,
      monthTotals,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
