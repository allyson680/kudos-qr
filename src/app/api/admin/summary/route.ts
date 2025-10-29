import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function isValidYM(ym: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}
function startOfMonthUTC(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
}
function startOfNextMonthUTC(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
}

// Format one doc into the row shape the UI expects
function toRow(d: FirebaseFirestore.QueryDocumentSnapshot): any {
  const v = d.data() as any;
  const ts =
    v?.voteTimestamp?.toDate?.() ??
    v?.voteTimestamp ??
    v?.time ??
    v?.createdAt?.toDate?.() ??
    new Date();
  return {
    id: d.id,
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
}

// Try a list of query functions until one returns >0 docs
async function tryQueries<T>(
  fns: Array<() => Promise<FirebaseFirestore.QuerySnapshot>>,
  debug: string[],
) {
  for (const fn of fns) {
    const snap = await fn();
    debug.push(`strategy hit: ${snap.size} docs`);
    if (!snap.empty) return snap.docs;
  }
  return [] as FirebaseFirestore.QueryDocumentSnapshot[];
}

export async function GET(req: Request) {
  const debugLines: string[] = [];
  try {
    const { searchParams } = new URL(req.url);
    const rawYm = searchParams.get("month") || getCurrentYM();
    const ym = isValidYM(rawYm) ? rawYm : getCurrentYM();
    const wantDebug = searchParams.get("debug") === "1";

    const todayKey = new Date().toISOString().slice(0, 10);
    const monthKey = ym;

    // --- TODAY (best effort, timestamp-only; if you need exact PT boundaries, store voteMonth at write time)
    let todayRows: any[] = [];
    try {
      const startToday = new Date();
      startToday.setHours(0, 0, 0, 0);
      const endToday = new Date();
      endToday.setHours(24, 0, 0, 0);

      // Try collectionGroup then root
      const todayDocs = await tryQueries(
        [
          () =>
            db
              .collectionGroup("votes")
              .where("voteTimestamp", ">=", admin.firestore.Timestamp.fromDate(startToday))
              .where("voteTimestamp", "<", admin.firestore.Timestamp.fromDate(endToday))
              .orderBy("voteTimestamp", "desc")
              .limit(200)
              .get(),
          () =>
            db
              .collection("votes")
              .where("voteTimestamp", ">=", admin.firestore.Timestamp.fromDate(startToday))
              .where("voteTimestamp", "<", admin.firestore.Timestamp.fromDate(endToday))
              .orderBy("voteTimestamp", "desc")
              .limit(200)
              .get(),
        ],
        debugLines,
      );
      todayRows = todayDocs.map(toRow);
    } catch (e) {
      debugLines.push(`today error: ${String(e)}`);
    }

    // --- SELECTED MONTH
    const start = startOfMonthUTC(ym);
    const end = startOfNextMonthUTC(ym);

    // Query order (each returns up to 200 docs):
    //  1) collectionGroup voteMonth equality
    //  2) root votes voteMonth equality
    //  3) collectionGroup timestamp range
    //  4) root votes timestamp range
    const monthDocs = await tryQueries(
      [
        // 1) cGroup voteMonth
        () => db.collectionGroup("votes").where("voteMonth", "==", ym).limit(200).get(),
        // 2) root voteMonth
        () => db.collection("votes").where("voteMonth", "==", ym).limit(200).get(),
        // 3) cGroup timestamp
        () =>
          db
            .collectionGroup("votes")
            .where("voteTimestamp", ">=", admin.firestore.Timestamp.fromDate(start))
            .where("voteTimestamp", "<", admin.firestore.Timestamp.fromDate(end))
            .orderBy("voteTimestamp", "desc")
            .limit(200)
            .get(),
        // 4) root timestamp
        () =>
          db
            .collection("votes")
            .where("voteTimestamp", ">=", admin.firestore.Timestamp.fromDate(start))
            .where("voteTimestamp", "<", admin.firestore.Timestamp.fromDate(end))
            .orderBy("voteTimestamp", "desc")
            .limit(200)
            .get(),
      ],
      debugLines,
    );

    let monthRows = monthDocs.map(toRow);

    // Safety net: if still nothing, show latest 50 from collectionGroup so the UI isn’t blank
    if (monthRows.length === 0) {
      debugLines.push("fallback: latest 50 from collectionGroup");
      const recent = await db.collectionGroup("votes").orderBy("__name__", "desc").limit(50).get();
      monthRows = recent.docs.map(toRow).filter((r) => r.time.startsWith(ym));
    }

    // --- GROUP totals by voterCompany
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

    const payload: any = {
      votingOpen,
      todayKey,
      monthKey,
      todayRows,
      monthRows,
      monthTotals,
    };

    if (wantDebug) {
      payload._debug = {
        projectId: admin.app().options.projectId,
        month: ym,
        tried: debugLines,
        counts: {
          todayRows: todayRows.length,
          monthRows: monthRows.length,
          monthTotals: monthTotals.length,
        },
      };
    }

    return NextResponse.json(payload);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
