// src/app/api/feedback/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { formatInTimeZone } from "date-fns-tz";
import admin from "@/lib/firebaseAdmin"; // <-- adjust if your admin init lives elsewhere

// Env
const TZ = process.env.VOTE_TZ || "America/Los_Angeles";
const FEEDBACK_SALT = process.env.FEEDBACK_SALT || "rotate-me";

function hashCode(code: string) {
  return crypto.createHmac("sha256", FEEDBACK_SALT).update(code).digest("hex");
}

export async function POST(req: Request) {
  try {
    const db = admin.firestore();
    const body = await req.json();

    const project = String(body?.project || "").trim();
    const voterCode = String(body?.voterCode || "").trim();
    const voterCompanyId = (body?.voterCompanyId ? String(body.voterCompanyId) : null) as string | null;
    const rating = Number(body?.rating);
    const rawNote = String(body?.note || "");

    if (!project || !voterCode || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const now = new Date();
    const dayKey = formatInTimeZone(now, TZ, "yyyy-MM-dd");
    const monthKey = formatInTimeZone(now, TZ, "yyyy-MM");

    const feedbackDoc = {
      project,
      rating,
      note: rawNote.slice(0, 600),
      voterCompanyId: voterCompanyId || null,
      voterCodeHash: hashCode(voterCode),
      dayKey,
      monthKey,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const workerRef = db.collection("workers").doc(voterCode);

    await db.runTransaction(async (tx) => {
      tx.set(db.collection("feedback").doc(), feedbackDoc);
      // bump lastFeedbackAt if worker exists
      const w = await tx.get(workerRef);
      if (w.exists) {
        tx.set(
          workerRef,
          { lastFeedbackAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
