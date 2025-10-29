import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

/* ------------------------- helpers ------------------------- */

function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
function toDateLocal(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function toTimeLocal(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function csvEscape(v: unknown): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

/* --------------------------- route --------------------------- */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawYm = searchParams.get("month") || getCurrentYM();
    const ym = isValidYM(rawYm) ? rawYm : getCurrentYM();
    const type = (searchParams.get("type") || "rows").toLowerCase();

    // Pull the month’s votes (no composite index required)
    const monthSnap = await db
      .collection("votes")
      .where("monthKey", "==", ym)
      .orderBy("__name__", "desc")
      .limit(2000)
      .get();

    type Raw = {
      id: string;
      iso: string;
      project?: string;
      voterCode?: string;
      voterCompanyId?: string;
      targetCode?: string;
      targetCompanyId?: string;
      voteType?: string;
      voterName?: string;
      targetName?: string;
    };

    const rowsRaw: Raw[] = monthSnap.docs.map((d) => {
      const v = d.data() as any;
      return {
        id: d.id,
        iso: toISO(v),
        project: v.project,
        voterCode: v.voterCode,
        voterCompanyId: v.voterCompanyId ?? v.voterCompany,
        targetCode: v.targetCode,
        targetCompanyId: v.targetCompanyId ?? v.targetCompany,
        voteType: v.voteType,
        voterName: v.voterName,
        targetName: v.targetName,
      };
    });

    // lookup maps
    const workerCodes = new Set<string>();
    const companyIds = new Set<string>();
    for (const r of rowsRaw) {
      if (r.voterCode) workerCodes.add(r.voterCode);
      if (r.targetCode) workerCodes.add(r.targetCode);
      if (r.voterCompanyId) companyIds.add(r.voterCompanyId);
      if (r.targetCompanyId) companyIds.add(r.targetCompanyId);
    }

    const [workersMap, companiesMap] = await Promise.all([
      fetchWorkersByCodes([...workerCodes]),
      fetchCompaniesByIds([...companyIds]),
    ]);

    // Enrich to display strings identical to the UI
    const enriched = rowsRaw.map((r) => {
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
        ...r,
        voterDisplay,
        targetDisplay,
        voterCompanyName,
        targetCompanyName,
        dateLocal: toDateLocal(r.iso),
        timeLocal: toTimeLocal(r.iso),
      };
    });

    // Build CSV by type
    let filename = "";
    let csv = "";

    if (type === "rows") {
      filename = `votes-${ym}.csv`;
      const header = [
        "Id",
        "Project",
        "Date",
        "Time",
        "DateTimeISO",
        "Voter",
        "VoterCode",
        "VoterCompany",
        "Target",
        "TargetCode",
        "TargetCompany",
        "VoteType",
      ];
      const lines = [header.map(csvEscape).join(",")];

      // newest first like the UI
      enriched.sort((a, b) => +new Date(b.iso) - +new Date(a.iso));

      for (const r of enriched) {
        const row = [
          r.id,
          r.project ?? "",
          r.dateLocal,
          r.timeLocal,
          r.iso,
          r.voterDisplay ?? "",
          r.voterCode ?? "",
          r.voterCompanyName ?? "",
          r.targetDisplay ?? "",
          r.targetCode ?? "",
          r.targetCompanyName ?? "",
          r.voteType ?? "",
        ];
        lines.push(row.map(csvEscape).join(","));
      }
      csv = lines.join("\n");
    } else if (type === "totals") {
      filename = `votes-by-company-${ym}.csv`;
      type Tot = { project: string; companyName: string; count: number };
      const map = new Map<string, Tot>();
      for (const r of enriched) {
        const key = `${r.project || ""}|${r.voterCompanyName || "(Unknown)"}`;
        const cur = map.get(key) || {
          project: r.project || "",
          companyName: r.voterCompanyName || "(Unknown)",
          count: 0,
        };
        cur.count += 1;
        map.set(key, cur);
      }
      const header = ["Project", "Company", "Votes"];
      const lines = [header.join(",")];
      const list = Array.from(map.values()).sort((a, b) => b.count - a.count);
      for (const t of list) {
        lines.push([t.project, t.companyName, String(t.count)].map(csvEscape).join(","));
      }
      csv = lines.join("\n");
    } else if (type === "targets") {
      filename = `top-targets-${ym}.csv`;
      type TargetTot = { project: string; targetDisplay: string; targetCompanyName: string; count: number };
      const map = new Map<string, TargetTot>();
      for (const r of enriched) {
        if (r.voteType && r.voteType !== "token") continue; // only tokens
        const targetDisplay = r.targetDisplay || r.targetCode || "(Unknown)";
        const targetCompanyName = r.targetCompanyName || "";
        const key = `${r.project || ""}|${targetDisplay}`;
        const cur = map.get(key) || {
          project: r.project || "",
          targetDisplay,
          targetCompanyName,
          count: 0,
        };
        cur.count += 1;
        map.set(key, cur);
      }
      const header = ["Project", "Target", "TargetCompany", "Tokens"];
      const lines = [header.join(",")];
      const list = Array.from(map.values()).sort((a, b) => b.count - a.count);
      for (const t of list) {
        lines.push(
          [t.project, t.targetDisplay, t.targetCompanyName, String(t.count)]
            .map(csvEscape)
            .join(","),
        );
      }
      csv = lines.join("\n");
    } else {
      return NextResponse.json({ error: `Unknown export type: ${type}` }, { status: 400 });
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
