import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { normalizeSticker } from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const DAILY_MAX_PER_VOTER = 3;
const MONTHLY_MAX_PER_COMPANY = 30;

function dayKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKeyUTC(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * GET /api/vote/limits?voter=NBK0001[&companyId=WALSH]
 * - dailyRemaining: tokens the voter can still give today
 * - companyRemaining / companyMonthlyRemaining: tokens the given company can still receive this month (only if companyId provided)
*/
export async function GET(req: NextRequest) {
  const db = getDb();
  try {
    const rawVoter = req.nextUrl.searchParams.get("voter") || "";
    const voterCode = normalizeSticker(rawVoter);
    const companyId = (req.nextUrl.searchParams.get("companyId") || "").trim();
    
    if (!voterCode) {
      return NextResponse.json({ ok: false, error: "Missing voter" }, { status: 400 });
    }
    
    // --- Daily remaining for the voter ---
    const dayKey = dayKeyUTC();
    const voterRef = db.collection("vote_counters").doc(`voterDaily_${voterCode}_${dayKey}`);
    const voterSnap = await voterRef.get();
    const usedDaily = voterSnap.exists ? (voterSnap.data()?.count || 0) : 0;
    const dailyRemaining = Math.max(0, DAILY_MAX_PER_VOTER - usedDaily);

    // --- Company monthly remaining (optional; only if companyId is provided) ---
    let companyRemaining: number | null = null;
    if (companyId) {
      const monKey = monthKeyUTC();
      const compRef = db.collection("vote_counters").doc(`companyMonthly_${companyId}_${monKey}`);
      const compSnap = await compRef.get();
      const usedCompany = compSnap.exists ? (compSnap.data()?.count || 0) : 0;
      companyRemaining = Math.max(0, MONTHLY_MAX_PER_COMPANY - usedCompany);
    }

    // Provide an alias for compatibility: companyMonthlyRemaining === companyRemaining
    return NextResponse.json({
      ok: true,
      dailyRemaining,
      companyId: companyId || null,
      companyRemaining,
      companyMonthlyRemaining: companyRemaining,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
