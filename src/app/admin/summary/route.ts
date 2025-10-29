import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

// ---- helpers
function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function startOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}
function startOfNextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 1, 0, 0, 0, 0);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ym = searchParams.get("month") || getCurrentYM();

    const todayKey = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const monthKey = ym;

    // --- TODAY (optional, keep your old logic if you have a special "today" endpoint)
    // Example: show today using the same timestamp field
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date();
    endToday.setHours(24, 0, 0, 0);

    const todaySnap = await db
      .collection("votes")
      .where("voteTimestamp", ">=", admin.firestore.Timestamp.fromDate(startToday))
      .where("voteTimestamp", "<", admin.firestore.Timestamp.fromDate(endToday))
      .orderBy("voteTimestamp", "desc")
      .get();

    const todayRows = todaySnap.docs.map((d) => {
      const v = d.data() as any;
      const ts = v.voteTimestamp?.toDate?.() ?? v.voteTimestamp ?? new Date();
      return {
        time: new Date(ts).toISOString(),
        project: v.project,
        voterCode: v.voterCode,
        voterName: v.voterName,
        voterCompany: v.voterCompany,
        targetCode: v.targetCode,
        targetName: v.targetName,
        targetCompany: v.targetCompany,
        voteType: v.voteType,
      };
    });

    // --- SELECTED MONTH
    const start = startOfMonth(ym);
    const end = startOfNextMonth(ym);

    // If you store a string like voteMonth: "YYYY-MM", replace this query with:
    // const monthSnap = await db.collection("votes").where("voteMonth", "==", ym).get();
    const monthSnap = await db
      .collection("votes")
      .where("voteTimestamp", ">=", admin.firestore.Timestamp.fromDate(start))
      .where("voteTimestamp", "<", admin.firestore.Timestamp.fromDate(end))
      .orderBy("voteTimestamp", "desc")
      .get();

    const monthRows = monthSnap.docs.map((d) => {
      const v = d.data() as any;
      const ts = v.voteTimestamp?.toDate?.() ?? v.voteTimestamp ?? new Date();
      return {
        time: new Date(ts).toISOString(),
        project: v.project,
        voterCode: v.voterCode,
        voterName: v.voterName,
        voterCompany: v.voterCompany,
        targetCode: v.targetCode,
        targetName: v.targetName,
        targetCompany: v.targetCompany,
        voteType: v.voteType,
      };
    });

    // --- GROUP: By Company (voter company here; change if you group by target company)
    type Tot = { companyId: string; companyName: string; project: string; count: number };
    const totalsMap = new Map<string, Tot>();

    for (const r of monthRows) {
      // If you have IDs, prefer them; otherwise use the name as the key
      const companyName = r.voterCompany ?? "(Unknown)";
      const project = r.project ?? "";
      const key = `${project}|${companyName}`;

      const cur = totalsMap.get(key) || {
        companyId: companyName, // replace with r.voterCompanyId if you have it
        companyName,
        project,
        count: 0,
      };
      cur.count += 1;
      totalsMap.set(key, cur);
    }

    const monthTotals = Array.from(totalsMap.values()).sort((a, b) => b.count - a.count);

    // TODO: if you have a real "voting window" flag, compute it here
    const votingOpen = true;

    return NextResponse.json({
      votingOpen,
      todayKey,
      monthKey,
      todayRows,
      monthRows,   // <-- your updated page.tsx will use this
      monthTotals, // <-- same shape as your UI
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
