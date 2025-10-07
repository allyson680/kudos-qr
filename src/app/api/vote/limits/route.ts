import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { dayKeyTZ, monthKeyTZ } from "@/lib/timeKeys";
import { normalizeSticker } from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_MAX_PER_VOTER = 3;
const MONTHLY_MAX_PER_COMPANY = 30;

export async function GET(req: NextRequest) {
  const db = getDb();
  try {
    const voter = normalizeSticker(req.nextUrl.searchParams.get("voter") || "");
    const companyId = (req.nextUrl.searchParams.get("companyId") || "").trim();
    if (!voter) return NextResponse.json({ ok: false, error: "Missing voter" }, { status: 400 });

    const now = new Date();
    const dayKey = dayKeyTZ(now);
    const monthKey = monthKeyTZ(now);

    const voterDailyRef = db.collection("vote_counters").doc(`voterDaily_${voter}_${dayKey}`);
    const companyMonthlyRef = companyId
      ? db.collection("vote_counters").doc(`companyMonthly_${companyId}_${monthKey}`)
      : null;

    const [vdSnap, cmSnap] = await Promise.all([voterDailyRef.get(), companyMonthlyRef?.get() ?? null]);

    const dailyCount = vdSnap.exists ? ((vdSnap.data() as any).count || 0) : 0;
    const companyMonthlyCount =
      cmSnap && cmSnap.exists ? ((cmSnap.data() as any).count || 0) : 0;

    const dailyRemaining = Math.max(0, DAILY_MAX_PER_VOTER - dailyCount);
    const companyMonthlyRemaining = companyId
      ? Math.max(0, MONTHLY_MAX_PER_COMPANY - companyMonthlyCount)
      : null;

    return NextResponse.json({
      ok: true,
      dayKey,
      monthKey,
      dailyRemaining,
      companyMonthlyRemaining,
      companyRemaining: companyMonthlyRemaining, // alias for FE
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}