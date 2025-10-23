import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeSticker, getProjectFromCode, toDashed } from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * If the worker doc exists under a dashed id (e.g. NBK-0001), move it to no-dash (NBK0001).
 * Returns the final snap (under the canonical id) and a boolean flag if a migration happened.
*/
async function migrateIfDashed(
  db: FirebaseFirestore.Firestore,
  codeCanonical: string
) {
  const canonicalRef = db.collection("workers").doc(codeCanonical);
  let snap = await canonicalRef.get();
  let migrated = false;

  if (!snap.exists) {
    const dashedId = toDashed(codeCanonical); // NBK0001 -> NBK-0001
    const dashedRef = db.collection("workers").doc(dashedId);
    const dashedSnap = await dashedRef.get();

    if (dashedSnap.exists) {
      const data = dashedSnap.data() as Record<string, unknown>;
      // write to canonical id
      await canonicalRef.set({ ...data, code: codeCanonical }, { merge: true });
      // delete dashed
      await dashedRef.delete().catch(() => {});
      snap = await canonicalRef.get();
      migrated = true;
    }
  }

  return { snap, migrated };
}

/**
 * GET /api/register?code=NBK1
*/
export async function GET(req: NextRequest) {
  const db = getDb();
  try {
    const raw = req.nextUrl.searchParams.get("code") || "";
    const code = normalizeSticker(raw); // NBK1 -> NBK0001
    const workers = db.collection("workers");
const byId = await workers.doc(code).get();



    // load companies
    const companiesSnap = await db.collection("companies").get();
    const companies = companiesSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));

    // find existing worker; migrate dashed -> no-dash if needed
    let existing: Record<string, unknown> | null = null;
    if (code) {
      const { snap } = await migrateIfDashed(db, code);
      if (snap.exists) {
        existing = { code: snap.id, ...(snap.data() as Record<string, unknown>) };
        // ensure the code field itself is canonical (no dash)
        if ((existing as any).code !== code) {
          await db.collection("workers").doc(code).set({ code }, { merge: true });
          (existing as any).code = code;
        }
      } else {
        // (optional) last-resort read under dashed id (no migration)
        const dashed = toDashed(code);
        const oldSnap = await db.collection("workers").doc(dashed).get();
        if (oldSnap.exists) {
          existing = { code: dashed, ...(oldSnap.data() as Record<string, unknown>) };
        }
      }
    }

    return NextResponse.json({ companies, existing });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "GET failed" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/register
 * Body: { code, fullName, companyId }
 * - Accepts NBK1 / NBK001 (no dash). Stores as NBK0001.
 * - Derives project from prefix.
 * - Also migrates any dashed doc to the canonical id.
*/
export async function POST(req: NextRequest) {
  const db = getDb();
  try {
    const body = await req.json();

    const code = normalizeSticker(String(body.code ?? ""));
    const fullName = String(body.fullName ?? "").trim();
    const fullNameLower = fullName.toLowerCase();
    const companyId = String(body.companyId ?? "").trim();

    if (!code || !fullName || !companyId) {
      return NextResponse.json(
        { ok: false, error: "Missing fields" },
        { status: 400 }
      );
    }

    const project = getProjectFromCode(code);
    const canonicalRef = db.collection("workers").doc(code);
    const dashedRef = db.collection("workers").doc(toDashed(code));

    await db.runTransaction(async (tx) => {
      const [canonSnap, dashedSnap] = await Promise.all([
        tx.get(canonicalRef),
        tx.get(dashedRef),
      ]);
      const now = FieldValue.serverTimestamp();

      if (dashedSnap.exists && !canonSnap.exists) {
        // migrate dashed -> canonical
        tx.set(
          canonicalRef,
          {
            ...dashedSnap.data(),
            code,
            project,
            fullName,
            fullNameLower,
            companyId,
            updatedAt: now,
          },
          { merge: true }
        );
        tx.delete(dashedRef);
      } else if (canonSnap.exists) {
        tx.set(
          canonicalRef,
          {
            code,
            project,
            fullName,
            fullNameLower,
            companyId,
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        tx.set(canonicalRef, {
          code,
          project,
          fullName,
          fullNameLower,
          companyId,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    return NextResponse.json({
      ok: true,
      worker: { code, project, fullName, companyId },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "POST failed" },
      { status: 500 }
    );
  }
}
