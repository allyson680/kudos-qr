import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getCurrentDayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function isValidYM(ym: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

function toRow(d: FirebaseFirestore.QueryDocumentSnapshot): any {
  const v = d.data() as any;
  const ts = v.createdAt?.toDate?.() ?? new Date();
  return {
    id: d.id,
    time: new Date(ts).toISOString(),
    project: v.project,
    voterCode: v.voterCode,
    voterName: v.voterName,
    voterCompany: v.voterCompanyId,
    targetCode: v.targetCode,
    targetName: v.targetName,
    targetCompany: v.targetCompanyId,
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

    // --- TODAY (query by dayKey)
    const todaySnap = await db
      .collection("votes")
      .where("dayKey", "==", todayKey)
      .orderBy("createdAt", "desc")
      .get();
    const todayRows = todaySnap.docs.map(toRow);

    // --- SELECTED MONTH (using monthKey!)
    const monthSnap = await db
      .collection("votes")
      .where("monthKey", "==", ym)
      .orderBy("createdAt", "desc")
      .get();
    const monthRows = monthSnap.docs.map(toRow);

    // --- GROUP totals by voterCompanyId
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
