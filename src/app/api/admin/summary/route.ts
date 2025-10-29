// src/app/api/admin/summary/route.ts
import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function getCurrentDayKey() {
  return new Date().toISOString().slice(0, 10);
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
function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawYm = searchParams.get("month") || getCurrentYM();
    const ym = isValidYM(rawYm) ? rawYm : getCurrentYM();

    const todayKey = getCurrentDayKey();
    const monthKey = ym;

    // Pull votes (no composite index required)
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
        voterCompanyId: v.voterCompanyId ?? v.voterCompany,
        targetCode: v.targetCode,
        targetName: v.targetName,
        targetCompanyId: v.targetCompanyId ?? v.targetCompany,
        voteType: v.voteType,
      };
    };

    const todayRaw = todaySnap.docs.map(toRaw);
    const monthRaw = monthSnap.docs.map(toRaw);

    // lookups
    const workerCodes = new Set<string>();
    const companyIds = new Set<string>();
    for (const r of [...todayRaw, ...monthRaw]) {
      if (r.voterCode) workerCodes.add(r.voterCode);
      if (r.targetCode) workerCodes.add(r.targetCode);
      if (r.voterCompanyId) companyIds.add(r.voterCompanyId);
      if (r.targetCompanyId) companyIds.add(r.targetCompanyId);
    }

    const [workersMap, companiesMap] = await Promise.all([
      fetchWorkersByCodes([...workerCodes]),
      fetchCompaniesByIds([...companyIds]),
    ]);

    const enrich = (rows: RawRow[]) =>
      rows.map((r) => {
        const voter = r.voterCode ? workersMap.get(r.voterCode) : undefined;
        const target = r.targetCode ? workersMap.get(r.targetCode) : undefined;

        const voterDisplay =
          voter?.fullName ? `${voter.fullName} (${r.voterCode})` : r.voterCode ?? "";
        const targetDisplay =
          target?.fullName ? `${target.fullName} (${r.targetCode})` : r.targetCode ?? "";

        const voterCompanyName =
          (r.voterCompanyId && companiesMap.get(r.voterCompanyId)) || r.voterCompanyId || "";
        const targetCompanyName =
          (r.targetCompanyId && companiesMap.get(r.targetCompanyId)) || r.targetCompanyId || "";

        return {
          id: r.id,
          time: r.time,
          project: r.project,
          voterCode: r.voterCode,
          voterName: voterDisplay,
          voterCompany: voterCompanyName,
          targetCode: r.targetCode,
          targetName: targetDisplay,
          targetCompany: targetCompanyName,
          voteType: r.voteType,
        };
      });

    const todayRows = enrich(todayRaw);
    const monthRows = enrich(monthRaw);

    // ---- totals by VOTER company (existing)
    type CompanyTot = { companyId: string; companyName: string; project: string; count: number };
    const byCompany = new Map<string, CompanyTot>();
    for (const r of monthRows) {
      const companyName = r.voterCompany || "(Unknown)";
      const project = r.project || "";
      const key = `${project}|${companyName}`;
      const cur = byCompany.get(key) || {
        companyId: companyName,
        companyName,
        project,
        count: 0,
      };
      cur.count += 1;
      byCompany.set(key, cur);
    }
    const monthTotals = Array.from(byCompany.values()).sort((a, b) => b.count - a.count);

    // ---- NEW: totals by TARGET (most tokens received)
    type TargetTot = {
      project: string;
      targetCode?: string;
      targetName: string;
      targetCompany?: string;
      count: number;
    };
    const byTarget = new Map<string, TargetTot>();
    for (const r of monthRows) {
      if (r.voteType && r.voteType !== "token") continue; // only tokens
      const project = r.project || "";
      const code = r.targetCode || "";
      const name = r.targetName || r.targetCode || "(Unknown)";
      const company = r.targetCompany || "";
      const key = `${project}|${code || name}`;

      const cur = byTarget.get(key) || {
        project,
        targetCode: code || undefined,
        targetName: name,
        targetCompany: company || undefined,
        count: 0,
      };
      cur.count += 1;
      byTarget.set(key, cur);
    }
    const monthTargetTotals = Array.from(byTarget.values()).sort((a, b) => b.count - a.count);

    const votingOpen = true;

    return NextResponse.json({
      votingOpen,
      todayKey,
      monthKey,
      todayRows,
      monthRows,
      monthTotals,
      monthTargetTotals, // <-- NEW
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
