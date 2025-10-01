// src/app/api/vote/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { normalizeSticker, toDashed, getProjectFromCode } from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Limits */
const WALSH_COMPANY_ID = "WALSH";
const DAILY_MAX_PER_VOTER = 3;
const MONTHLY_MAX_PER_COMPANY = 30;

/** Request body */
const BodySchema = z.object({
  voterCode: z.string(),
  targetCode: z.string(),
  voteType: z.enum(["token", "goodCatch"]).optional().default("token"),
});

/** Key helpers (UTC window) */
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

/** Simple notification write (now receives db) */
async function createNotification(
  db: FirebaseFirestore.Firestore,
  params: {
    targetCode: string;
    voteType: "token" | "goodCatch";
    voterCode: string;
  }
) {
  const { targetCode, voteType, voterCode } = params;
  const title =
    voteType === "goodCatch" ? "You received a Good Catch!" : "You received a Token!";
  const body =
    voteType === "goodCatch"
      ? `Someone recognized your Good Catch.`
      : `Someone gave you a virtual token.`;

  await db.collection("notifications").add({
    targetCode,
    voterCode,
    voteType,
    title,
    body,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function POST(req: NextRequest) {
  const db = getDb();
  try {
    // Validate body
    const json = await req.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    // Normalize codes
    const voterCodeNorm = normalizeSticker(parsed.data.voterCode);
    const targetCodeNorm = normalizeSticker(parsed.data.targetCode);
    const voteType = parsed.data.voteType;

    if (!voterCodeNorm || !targetCodeNorm) {
      return NextResponse.json({ ok: false, error: "Missing codes" }, { status: 400 });
    }
    if (voterCodeNorm === targetCodeNorm) {
      return NextResponse.json({ ok: false, error: "No self voting" }, { status: 400 });
    }

    // Load voter / target with dashed fallback
    const voterRef = db.collection("workers").doc(voterCodeNorm);
    const targetRef = db.collection("workers").doc(targetCodeNorm);

    let voterSnap = await voterRef.get();
    if (!voterSnap.exists) {
      const vDashed = await db.collection("workers").doc(toDashed(voterCodeNorm)).get();
      if (vDashed.exists) voterSnap = vDashed;
    }

    let targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      const tDashed = await db.collection("workers").doc(toDashed(targetCodeNorm)).get();
      if (tDashed.exists) targetSnap = tDashed;
    }

    if (!voterSnap.exists) {
      return NextResponse.json({ ok: false, error: "Voter not registered" }, { status: 400 });
    }
    if (!targetSnap.exists) {
      return NextResponse.json({ ok: false, error: "Target not registered" }, { status: 400 });
    }

    const voter = voterSnap.data() as any;
    const target = targetSnap.data() as any;

    // No same-company voting
    if (voter.companyId === target.companyId) {
      return NextResponse.json(
        { ok: false, error: "No same-company voting" },
        { status: 400 }
      );
    }

    // Same-project only
    const voterProject = voter.project ?? getProjectFromCode(voterCodeNorm);
    const targetProject = target.project ?? getProjectFromCode(targetCodeNorm);
    if (voterProject !== targetProject) {
      return NextResponse.json(
        { ok: false, error: "Same-project only (NBK→NBK, JP→JP)" },
        { status: 400 }
      );
    }

    // Good Catch is Walsh-only
    const voterIsWalsh = String(voter.companyId) === WALSH_COMPANY_ID;
    if (voteType === "goodCatch" && !voterIsWalsh) {
      return NextResponse.json(
        { ok: false, error: "Good Catch is Walsh-only" },
        { status: 403 }
      );
    }

    // Counters (NOTE: company monthly is for the VOTER's company budget)
    const now = new Date();
    const dayKey = dayKeyUTC(now);
    const monthKey = monthKeyUTC(now);

    const voterDailyRef = db
      .collection("vote_counters")
      .doc(`voterDaily_${voterCodeNorm}_${dayKey}`);

    const companyMonthlyRef = db
      .collection("vote_counters")
      .doc(`companyMonthly_${voter.companyId}_${monthKey}`);

    const voteRef = db.collection("votes").doc();

    // Pre-read counts once (used for GC response & token baseline)
    const [vdSnapPre, cmSnapPre] = await Promise.all([
      voterDailyRef.get(),
      companyMonthlyRef.get(),
    ]);
    const currDaily = vdSnapPre.exists ? ((vdSnapPre.data() as any).count || 0) : 0;
    const currMonthly = cmSnapPre.exists ? ((cmSnapPre.data() as any).count || 0) : 0;

    // ---------- GOOD CATCH (does NOT consume limits) ----------
    if (voteType === "goodCatch") {
      await db.runTransaction(async (tx) => {
        tx.set(voteRef, {
          voterCode: voterCodeNorm,
          targetCode: targetCodeNorm,
          voterCompanyId: voter.companyId,
          targetCompanyId: target.companyId,
          // 👇 add these so Admin Summary works
          companyId: voter.companyId,
          project: voterProject,
          voteType: "goodCatch",
          createdAt: FieldValue.serverTimestamp(),
          dayKey,
          monthKey,
        });
      });

      const displayName = (target.fullName || "").trim();
      const niceTarget = { code: targetCodeNorm, fullName: displayName };

      const dailyRemaining = Math.max(0, DAILY_MAX_PER_VOTER - currDaily);
      const companyMonthlyRemaining = Math.max(
        0,
        MONTHLY_MAX_PER_COMPANY - currMonthly
      );

      await createNotification(db, {
        targetCode: targetCodeNorm,
        voteType: "goodCatch",
        voterCode: voterCodeNorm,
      });

      const message =
        `Good Catch for ${displayName || targetCodeNorm} (${targetCodeNorm}) recorded. ` +
        `Good Catches don’t count against daily or monthly token limits. ` +
        `You still have ${dailyRemaining} token${dailyRemaining === 1 ? "" : "s"} left today. ` +
        `Your company still has ${companyMonthlyRemaining} token${
          companyMonthlyRemaining === 1 ? "" : "s"
        } left this month.`;

      return NextResponse.json({
        ok: true,
        voteType: "goodCatch",
        message,
        target: niceTarget,
        dailyRemaining,
        companyMonthlyRemaining,
        companyRemaining: companyMonthlyRemaining, // alias for FE
      });
    }

    // ---------- TOKEN (consumes limits) ----------
    let dailyRemaining = 0;
    let companyMonthlyRemaining = 0;

    await db.runTransaction(async (tx) => {
      const [vdSnap, cmSnap] = await Promise.all([
        tx.get(voterDailyRef),
        tx.get(companyMonthlyRef),
      ]);

      const voterDailyCount = vdSnap.exists ? ((vdSnap.data() as any).count || 0) : 0;
      const companyMonthlyCount = cmSnap.exists
        ? ((cmSnap.data() as any).count || 0)
        : 0;

      if (voterDailyCount >= DAILY_MAX_PER_VOTER) {
        throw new Error("Daily limit reached");
      }
      if (companyMonthlyCount >= MONTHLY_MAX_PER_COMPANY) {
        throw new Error("Company monthly limit reached");
      }

      // Record the vote
      tx.set(voteRef, {
        voterCode: voterCodeNorm,
        targetCode: targetCodeNorm,
        voterCompanyId: voter.companyId,
        targetCompanyId: target.companyId,
        // 👇 add fields needed by admin reports
        companyId: voter.companyId,
        project: voterProject,
        voteType: "token",
        createdAt: FieldValue.serverTimestamp(),
        dayKey,
        monthKey,
      });

      // Increment counters
      tx.set(
        voterDailyRef,
        {
          key: `voterDaily:${voterCodeNorm}:${dayKey}`,
          voterCode: voterCodeNorm,
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
          companyId: voter.companyId,
          monthKey,
          count: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Remaining AFTER this write
      dailyRemaining = Math.max(0, DAILY_MAX_PER_VOTER - (voterDailyCount + 1));
      companyMonthlyRemaining = Math.max(
        0,
        MONTHLY_MAX_PER_COMPANY - (companyMonthlyCount + 1)
      );
    });

    const displayName = (target.fullName || "").trim();
    const niceTarget = { code: targetCodeNorm, fullName: displayName };

    await createNotification(db, {
      targetCode: targetCodeNorm,
      voteType: "token",
      voterCode: voterCodeNorm,
    });

    const message =
      `Your virtual token has been given to ${displayName || targetCodeNorm} (${targetCodeNorm}). ` +
      `You have ${dailyRemaining} token${dailyRemaining === 1 ? "" : "s"} left today. ` +
      `Your company has ${companyMonthlyRemaining} token${
        companyMonthlyRemaining === 1 ? "" : "s"
      } left this month.`;

    return NextResponse.json({
      ok: true,
      voteType: "token",
      message,
      target: niceTarget,
      dailyRemaining,
      companyMonthlyRemaining,
      companyRemaining: companyMonthlyRemaining, // alias for FE
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (/daily limit/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "Daily limit reached", dailyRemaining: 0 },
        { status: 400 }
      );
    }
    if (/company monthly limit/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Company monthly limit reached",
          companyMonthlyRemaining: 0,
          companyRemaining: 0,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: "Vote failed" }, { status: 500 });
  }
}
