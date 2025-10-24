import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import {
  normalizeSticker,
  getProjectFromCode,
  toDashed,
  normalizeStickerStrict,
} from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Normalize a person's name for uniqueness (trim + single spaces + lowercase)
 */
function nameKey(fullName: string) {
  return (fullName || "").trim().toLowerCase().replace(/\s+/g, " ");
}

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
 * - If code provided and valid, returns { existing } for that worker (after migrating dashed).
 * - Always returns { companies } for the dropdown.
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  try {
    const raw = req.nextUrl.searchParams.get("code") || "";
    // Strict canonical NBK/JP only; null if invalid
    const strict = normalizeStickerStrict(raw); // NBK1 -> NBK0001 (or null)
    const code = strict || ""; // fall back to empty if invalid

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
 *
 * Server-side rules enforced:
 * - Code must be NBK/JP + 1–4 digits (stored as NBK0001/JP0042).
 * - One number per project (NBK vs JP independent).
 * - Each name can be used once per project (but can exist in both NBK and JP).
 * - Dashed worker docs are migrated to canonical id.
 *
 * Uses transaction + lock docs:
 * - codeLocks/{PROJECT-NUMBER} e.g. NBK-12
 * - nameLocks/{PROJECT:normalized_name} e.g. NBK:sam taylor
 */
export async function POST(req: NextRequest) {
  const db = getDb();
  try {
    const body = await req.json();

    const strict = normalizeStickerStrict(String(body.code ?? ""));
    const fullName = String(body.fullName ?? "").trim();
    const companyId = String(body.companyId ?? "").trim();

    if (!strict) {
      return NextResponse.json(
        {
          ok: false,
          code: "BAD_CODE_FORMAT",
          error:
            "Code must start with NBK or JP and have 1–4 digits (e.g., NBK12 or JP-003).",
        },
        { status: 400 }
      );
    }
    if (!fullName) {
      return NextResponse.json(
        { ok: false, code: "MISSING_NAME", error: "Name is required." },
        { status: 400 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { ok: false, code: "MISSING_COMPANY", error: "Company is required." },
        { status: 400 }
      );
    }

    // Canonical worker code like NBK0007; derive project + unpadded number for locks
    const code = strict;
    const project = getProjectFromCode(code); // "NBK" or "JP"
    const numberPart = code.replace(/^(NBK|JP)/, ""); // "0007"
    const unpaddedNumber = String(parseInt(numberPart, 10)); // "7" (no leading zeros)
    const codeLockId = `${project}-${unpaddedNumber}`;
    const nameLockId = `${project}:${nameKey(fullName)}`;

    const workerRef = db.collection("workers").doc(code);
    const dashedRef = db.collection("workers").doc(toDashed(code));
    const codeLockRef = db.collection("codeLocks").doc(codeLockId);
    const nameLockRef = db.collection("nameLocks").doc(nameLockId);

    await db.runTransaction(async (tx) => {
      const [wSnap, dSnap, cSnap, nSnap] = await Promise.all([
        tx.get(workerRef),
        tx.get(dashedRef),
        tx.get(codeLockRef),
        tx.get(nameLockRef),
      ]);

      const now = FieldValue.serverTimestamp();

      // --- Enforce uniqueness: number per project
      if (cSnap.exists) {
        const ownerCode = cSnap.get("code");
        // If the lock exists and belongs to a different worker code, block
        if (ownerCode && ownerCode !== code) {
          throw new Error("CODE_TAKEN");
        }
      }

      // --- Enforce uniqueness: name per project
      if (nSnap.exists) {
        const ownerCode = nSnap.get("code");
        if (ownerCode && ownerCode !== code) {
          throw new Error("NAME_TAKEN");
        }
      }

      // --- Migrate dashed to canonical if needed (and canonical doesn't exist yet)
      if (dSnap.exists && !wSnap.exists) {
        tx.set(
          workerRef,
          {
            ...dSnap.data(),
            code,
            project,
            fullName,
            fullNameLower: nameKey(fullName),
            companyId,
            updatedAt: now,
          },
          { merge: true }
        );
        tx.delete(dashedRef);
      } else if (wSnap.exists) {
        // Update existing worker (allowed). If the name changes, locks must already match this code.
        tx.set(
          workerRef,
          {
            code,
            project,
            fullName,
            fullNameLower: nameKey(fullName),
            companyId,
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        // Create new worker
        tx.set(workerRef, {
          code,
          project,
          fullName,
          fullNameLower: nameKey(fullName),
          companyId,
          createdAt: now,
          updatedAt: now,
        });
      }

      // --- Upsert locks so future writes collide properly
      tx.set(
        codeLockRef,
        {
          project,
          number: Number(unpaddedNumber),
          code, // points to canonical worker id
          fullName,
          lockedAt: now,
        },
        { merge: true }
      );

      tx.set(
        nameLockRef,
        {
          project,
          nameKey: nameKey(fullName),
          code,
          fullName,
          lockedAt: now,
        },
        { merge: true }
      );
    });

    return NextResponse.json({
      ok: true,
      worker: { code, project, fullName, companyId },
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("CODE_TAKEN")) {
      return NextResponse.json(
        { ok: false, code: "CODE_TAKEN", error: "That number is already used for this project." },
        { status: 409 }
      );
    }
    if (msg.includes("NAME_TAKEN")) {
      return NextResponse.json(
        { ok: false, code: "NAME_TAKEN", error: "That name is already registered for this project." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, error: e?.message || "POST failed" },
      { status: 500 }
    );
  }
}
