// src/app/api/admin/summary/export/route.ts
import { NextResponse } from "next/server";
import admin, { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

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

// simple CSV escaper: wrap if needed, double-up quotes
function csvField(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCSV(rows: any[], headers: string[]): string {
  const lines = [];
  lines.push(headers.map(csvField).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => csvField(r[h])).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ym = searchParams.get("month") || getCurrentYM();
    const type = (searchParams.get("type") || "rows").toLowerCase(); // "rows" | "totals"

    // ----- Query the month -----
    const start = startOfMonth(ym);
    const end = startOfNextMonth(ym);

    // If you store voteMonth: "YYYY-MM", you can replace with:
    // const monthSnap = await db.collection("votes").where("voteMonth", "==", ym).get();
    const monthSnap = await db
      .collection("votes")
      .where("voteTimestamp", ">=", admin.firestore.Timestamp.fromDate(start))
      .where("voteTimestamp", "<", admin.firestore.Timestamp.fromDate(end))
      .orderBy("voteTimestamp", "desc")
      .get();

    // Normalize docs
    const monthRows = monthSnap.docs.map((d) => {
      const v = d.data() as any;
      const ts = v.voteTimestamp?.toDate?.() ?? v.voteTimestamp ?? new Date();
      const iso = new Date(ts).toISOString();
      return {
        id: d.id,
        timeISO: iso,
        date: iso.slice(0, 10),
        timeLocal: new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        project: v.project ?? "",
        voteType: v.voteType ?? "",
        voterCode: v.voterCode ?? "",
        voterName: v.voterName ?? "",
        voterCompany: v.voterCompany ?? "",
        targetCode: v.targetCode ?? "",
        targetName: v.targetName ?? "",
        targetCompany: v.targetCompany ?? "",
      };
    });

    if (type === "totals") {
      // ---- company totals (by voter company; switch if you want target company)
      type Tot = { project: string; companyName: string; count: number };
      const map = new Map<string, Tot>();
      for (const r of monthRows) {
        const key = `${r.project}|${r.voterCompany}`;
        const cur = map.get(key) || { project: r.project, companyName: r.voterCompany, count: 0 };
        cur.count += 1;
        map.set(key, cur);
      }
      const totals = Array.from(map.values()).sort((a, b) => b.count - a.count);

      const headers = ["project", "companyName", "count", "month"];
      const data = totals.map((t) => ({ ...t, month: ym }));
      const csv = toCSV(data, headers);

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="totals_${ym}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // default: export all rows
    const headers = [
      "id",
      "timeISO",
      "date",
      "timeLocal",
      "project",
      "voteType",
      "voterCode",
      "voterName",
      "voterCompany",
      "targetCode",
      "targetName",
      "targetCompany",
      "month",
    ];
    const data = monthRows.map((r) => ({ ...r, month: ym }));
    const csv = toCSV(data, headers);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="votes_${ym}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
