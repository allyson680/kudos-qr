// src/app/api/admin/summary/route.ts
import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

// --------- utils ----------
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
function toISO(v: any) {
  const ts =
    v?.createdAt?.toDate?.() ??
    v?.createdAt ??
    v?.time ??
    v?.voteTimestamp?.toDate?.() ??
    new Date();
  return new Date(ts).toISOString();
}

// chunk helper for IN queries (Firestore max 10 ids per chunk)
function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// fetch workers by codes (doc IDs are the codes, e.g. "NBK0023")
async function fetchWorkersByCodes(codes: string[]) {
  const map = new Map<string, { fullName?: string; companyId?: string }>();
  if (codes.length === 0) return map;

  const idField = admin.firestore.FieldPath.documentId();
  for (const group of chunk(codes, 10)) {
    const snap = await db.collection("workers").where(idField, "in", group).get();
    snap.docs.forEach((d) => {
      const w = d.data() as any;
      map.set(d.id, { fullName: w.fullName, companyId: w.companyId });
    });
  }
  return map;
}

// fetch company names by IDs (doc IDs are company IDs; field "name")
async function fetchCompaniesByIds(ids: string[]) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const idField = admin.firestore.FieldPath.documentId();
  for (const group of chunk(ids, 10)) {
    const snap = await db.collection("companies").where(idField, "in", group).get();
    snap.docs.forEach((d) => {
      const c = d.data() as any;
      map.set(d.id, c?.name ?? d.id);
    });
  }
  return map;
}

// --------- route ----------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawYm = searchParams.get("month") || getCurrentYM();
    const ym = isValidYM(rawYm) ? rawYm : getCurrentYM();

    const todayKey = getCurrentDayKey();
    const monthKey = ym;

    // --- pull votes (no composite index required)
    const todaySnap = await db
      .collection("votes")
      .where("dayKey", "==", todayKey)
      .orderBy("__name__", "desc")
      .limit(500)
      .get();

    const monthSnap = await db
      .collection("votes")
      .where("monthKey", "==", ym)
      .orderBy("__name__", "desc")
      .limit(2000)
      .get();

    // Normalize rows (raw)
    type RawRow = {
      id: string;
      time: string;
      project?: string;
      voterCode?: string;
      voterName?: string;
      voterCompanyId?: string;
      targetCode?: string;
      targetName?: string;
      targetCompanyId?: string;
      voteType?: string;
    };

    const toRaw = (d: FirebaseFirestore.QueryDocumentSnapshot): RawRow => {
      const v = d.data() as any;
      return {
        id: d.id,
        time: toISO(v),
        project: v.project,
        voterCode: v.voterCode,
        voterName: v.voterName,
        voterCompanyId: v.voterCompanyId ?? v.voterCompany, // support either key
        targetCode: v.targetCode,
        targetName: v.targetName,
        targetCompanyId: v.targetCompanyId ?? v.targetCompany,
        voteType: v.voteType,
      };
    };

    const todayRaw = todaySnap.docs.map(toRaw);
    const monthRaw = monthSnap.docs.map(toRaw);

    // --- collect lookups (workers + companies)
    const workerCodes = new Set<string>();
    const companyIds = new Set<string>();

    for (const r of monthRaw) {
      if (r.voterCode) workerCodes.add(r.voterCode);
      if (r.targetCode) workerCodes.add(r.targetCode);
      if (r.voterCompanyId) companyIds.add(r.voterCompanyId);
      if (r.targetCompanyId) companyIds.add(r.targetCompanyId);
    }
    // include today's too (in case someone browses current day)
    for (const r of todayRaw) {
      if (r.voterCode) workerCodes.add(r.voterCode);
      if (r.targetCode) workerCodes.add(r.targetCode);
      if (r.voterCompanyId) companyIds.add(r.voterCompanyId);
      if (r.targetCompanyId) companyIds.add(r.targetCompanyId);
    }

    const [workersMap, companiesMap] = await Promise.all([
      fetchWorkersByCodes([...workerCodes]),
      fetchCompaniesByIds([...companyIds]),
    ]);

    // --- enrich rows
    const enrich = (rows: RawRow[]) =>
      rows.map((r) => {
        const voter = r.voterCode ? workersMap.get(r.voterCode) : undefined;
        const target = r.targetCode ? workersMap.get(r.targetCode) : undefined;

        // Workers A: "Full Name (CODE)" if full name exists; else just CODE
        const voterDisplay =
          voter?.fullName ? `${voter.fullName} (${r.voterCode})` : r.voterCode ?? "";
        const targetDisplay =
          target?.fullName ? `${target.fullName} (${r.targetCode})` : r.targetCode ?? "";

        // Companies: show name only (IDs still available in *_CompanyId)
        const voterCompanyName =
          (r.voterCompanyId && companiesMap.get(r.voterCompanyId)) || r.voterCompanyId || "";
        const targetCompanyName =
          (r.targetCompanyId && companiesMap.get(r.targetCompanyId)) || r.targetCompanyId || "";

        return {
          id: r.id,
          time: r.time,
          project: r.project,
          voterCode: r.voterCode,
          voterName: voterDisplay, // <-- UI uses voterName || voterCode
          voterCompany: voterCompanyName, // <-- UI column shows this
          targetCode: r.targetCode,
          targetName: targetDisplay, // <-- UI uses targetName || targetCode
          targetCompany: targetCompanyName,
          voteType: r.voteType,
        };
      });

    const todayRows = enrich(todayRaw);
    const monthRows = enrich(monthRaw);

    // --- group totals by VOTER company name
    type Tot = { companyId: string; companyName: string; project: string; count: number };
    const totalsMap = new Map<string, Tot>();
    for (const r of monthRows) {
      const companyName = r.voterCompany || "(Unknown)";
      const project = r.project || "";
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

    // your real window logic can go here
    const votingOpen = true;

    return NextResponse.json({
      votingOpen,
      todayKey: getCurrentDayKey(),
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
