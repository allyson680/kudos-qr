import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { normalizeSticker, toDashed, getProjectFromCode } from "@/lib/codeUtils";
import { dayKeyTZ, monthKeyTZ } from "@/lib/timeKeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WALSH_COMPANY_ID = "WALSH";
const DAILY_MAX_PER_VOTER = 3;
const MONTHLY_MAX_PER_COMPANY = 30;

const BodySchema = z.object({
  voterCode: z.string(),
  targetCode: z.string(),
  voteType: z.enum(["token", "goodCatch"]).optional().default("token"),
});

export async function POST(req: NextRequest) {
  const db = getDb();
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, code: "BAD_BODY", error: "Invalid body" }, { status: 400 });
    }

    // Normalize
    const voterCode = normalizeSticker(parsed.data.voterCode);
    const targetCode = normalizeSticker(parsed.data.targetCode);
    const voteType = parsed.data.voteType;

    if (!voterCode || !targetCode) {
      return NextResponse.json({ ok: false, code: "MISSING_CODES", error: "Missing codes" }, { status: 400 });
    }
    if (voterCode === targetCode) {
      return NextResponse.json({ ok: false, code: "SELF_VOTE", error: "No self voting" }, { status: 400 });
    }

    // Load worker docs (consider dashed fallback)
    const loadWorker = async (code: string) => {
      const ref = db.collection("workers").doc(code);
      let snap = await ref.get();
      if (!snap.exists) {
        const dashed = db.collection("workers").doc(toDashed(code));
        const dSnap = await dashed.get();
        if (dSnap.exists) snap = dSnap;
      }
      return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
    };

    const [voter, target] = await Promise.all([loadWorker(voterCode), loadWorker(targetCode)]);
    if (!voter) return NextResponse.json({ ok: false, code: "VOTER_UNREGISTERED", error: "Voter not registered" }, { status: 400 });
    if (!target) return NextResponse.json({ ok: false, code: "TARGET_UNREGISTERED", error: "Target not registered" }, { status: 400 });

    // Same-project only
    const voterProject = voter.project ?? getProjectFromCode(voterCode);
    const targetProject = target.project ?? getProjectFromCode(targetCode);
    if (voterProject !== targetProject) {
      return NextResponse.json({ ok: false, code: "DIFF_PROJECT", error: "Same-project only (NBK→NBK, JP→JP)" }, { status: 400 });
    }

    // No same-company voting
    if (voter.companyId && target.companyId && voter.companyId === target.companyId) {
      return NextResponse.json({ ok: false, code: "SAME_COMPANY", error: "No same-company voting" }, { status: 400 });
    }

    // Good Catch is Walsh-only
    const voterIsWalsh = String(voter.companyId || "") === WALSH_COMPANY_ID;
    if (voteType === "goodCatch" && !voterIsWalsh) {
      return NextResponse.json({ ok: false, code: "GC_WALSH_ONLY", error: "Good Catch is Walsh-only" }, { status: 403 });
    }

    // TZ keys (resets at local midnight)
    const now = new Date();
    const dayKey = dayKeyTZ(now);
    const monthKey = monthKeyTZ(now);

    // Counter docs
    const voterDailyRef = db.collection("vote_counters").doc(`voterDaily_${voterCode}_${dayKey}`);
    const companyMonthlyRef = db.collection("vote_counters").doc(`companyMonthly_${voter.companyId}_${monthKey}`);
    const voteRef = db.collection("votes").doc();

    // Pre-read for return messaging
    const [vdPre, cmPre] = await Promise.all([voterDailyRef.get(), companyMonthlyRef.get()]);
    const currDaily = vdPre.exists ? ((vdPre.data() as any).count || 0) : 0;
    const currMonthly = cmPre.exists ? ((cmPre.data() as any).count || 0) : 0;

    // Good Catch: record but do not consume limits
    if (voteType === "goodCatch") {
      await db.runTransaction(async (tx) => {
        tx.set(voteRef, {
          voterCode,
          targetCode,
          voterCompanyId: voter.companyId || "",
          targetCompanyId: target.companyId || "",
          project: voterProject,
          voteType: "goodCatch",
          createdAt: FieldValue.serverTimestamp(),
          dayKey,
          monthKey,
        });
      });
      const dailyRemaining = Math.max(0, DAILY_MAX_PER_VOTER - currDaily);
      const companyMonthlyRemaining = Math.max(0, MONTHLY_MAX_PER_COMPANY - currMonthly);
      return NextResponse.json({
        ok: true,
        voteType: "goodCatch",
        message: `Good Catch recorded for ${target.fullName || targetCode}.`,
        target: { code: targetCode, fullName: target.fullName || "" },
        dailyRemaining,
        companyMonthlyRemaining,
        companyRemaining: companyMonthlyRemaining,
      });
    }

    // Token: enforce limits
    let dailyRemaining = 0;
    let companyMonthlyRemaining = 0;

    await db.runTransaction(async (tx) => {
      const [vdSnap, cmSnap] = await Promise.all([tx.get(voterDailyRef), tx.get(companyMonthlyRef)]);

      const voterDailyCount = vdSnap.exists ? ((vdSnap.data() as any).count || 0) : 0;
      const companyMonthlyCount = cmSnap.exists ? ((cmSnap.data() as any).count || 0) : 0;

      if (voterDailyCount >= DAILY_MAX_PER_VOTER) throw new Error("DAILY_LIMIT");
      if (companyMonthlyCount >= MONTHLY_MAX_PER_COMPANY) throw new Error("COMPANY_MONTHLY_LIMIT");

      tx.set(voteRef, {
        voterCode,
        targetCode,
        voterCompanyId: voter.companyId || "",
        targetCompanyId: target.companyId || "",
        project: voterProject,
        voteType: "token",
        createdAt: FieldValue.serverTimestamp(),
        dayKey,
        monthKey,
      });

      tx.set(
        voterDailyRef,
        {
          key: `voterDaily:${voterCode}:${dayKey}`,
          voterCode,
          dayKey,
          count: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.set(
        companyMonthlyRef,
        {
          key: `companyMonthly:${voter.companyId}:${monthKey}`,
          companyId: voter.companyId || "",
          monthKey,
          count: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      dailyRemaining = Math.max(0, DAILY_MAX_PER_VOTER - (voterDailyCount + 1));
      companyMonthlyRemaining = Math.max(0, MONTHLY_MAX_PER_COMPANY - (companyMonthlyCount + 1));
    });

    return NextResponse.json({
      ok: true,
      voteType: "token",
      message: `Your token has been given to ${target.fullName || targetCode}.`,
      target: { code: targetCode, fullName: target.fullName || "" },
      dailyRemaining,
      companyMonthlyRemaining,
      companyRemaining: companyMonthlyRemaining,
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "DAILY_LIMIT") {
      return NextResponse.json({ ok: false, code: "DAILY_LIMIT", error: "Daily limit reached", dailyRemaining: 0 }, { status: 400 });
    }
    if (msg === "COMPANY_MONTHLY_LIMIT") {
      return NextResponse.json({
        ok: false,
        code: "COMPANY_MONTHLY_LIMIT",
        error: "Company monthly limit reached",
        companyMonthlyRemaining: 0,
        companyRemaining: 0,
      }, { status: 400 });
    }
    return NextResponse.json({ ok: false, code: "VOTE_FAILED", error: "Vote failed" }, { status: 500 });
  }
}