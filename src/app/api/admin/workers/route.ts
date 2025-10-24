import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { normalizeStickerStrict } from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/workers
 * Query params:
 *   - companyId?: string   (if present, limit to this company)
 *   - q?: string           (name or code; if absent and companyId present, list first N)
 *   - limit?: number       (default 50, max 200)
 *
 * Behavior:
 *   - If q looks like an NBK/JP code (1–4 digits), we return that exact code (if exists) and
 *     also do a light prefix search by number within the same project.
 *   - Otherwise, we do a case-insensitive name "starts with" search via fullNameLower.
 *   - If q is empty but companyId is present, we list the first N workers for that company.
 */
export async function GET(req: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const companyId = (searchParams.get("companyId") || "").trim();
    const rawQ = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

    // 1) No q but company selected -> list-by-company (sorted by name)
    if (!rawQ && companyId) {
      // ⚠️ Firestore will likely ask for a composite index: companyId + fullNameLower
      const snap = await db
        .collection("workers")
        .where("companyId", "==", companyId)
        .orderBy("fullNameLower")
        .limit(limit)
        .get();

      const workers = snap.docs.map((d) => ({
        code: d.get("code"),
        fullName: d.get("fullName") || "",
        companyId: d.get("companyId") || "",
      }));

      return NextResponse.json({ ok: true, workers });
    }

    // 2) If q looks like a code, return that worker directly (fast path)
    const asCode = normalizeStickerStrict(rawQ);
    if (asCode) {
      const ref = db.collection("workers").doc(asCode);
      const doc = await ref.get();
      const exact = doc.exists
        ? [{
            code: doc.get("code"),
            fullName: doc.get("fullName") || "",
            companyId: doc.get("companyId") || "",
          }]
        : [];

      // Optionally, if companyId is present, ensure the match respects the filter
      const filtered = companyId ? exact.filter(w => w.companyId === companyId) : exact;

      return NextResponse.json({ ok: true, workers: filtered });
    }

    // 3) Name search: case-insensitive "starts with" using fullNameLower
    // Build lowercased query bounds, e.g., "sam" -> ["sam", "sam\uffff"]
    const qLower = rawQ.toLowerCase();
    const startAt = qLower;
    const endAt = qLower + "\uf8ff"; // typical unicode high sentinel

    let query: FirebaseFirestore.Query = db.collection("workers");
    if (companyId) query = query.where("companyId", "==", companyId);
    
    query = query
      .orderBy("fullNameLower")
      .startAt(startAt)
      .endAt(endAt)
      .limit(limit);

    // ⚠️ Firestore will likely require a composite index for (companyId, fullNameLower)
    const snap = await query.get();

    const workers = snap.docs.map((d) => ({
      code: d.get("code"),
      fullName: d.get("fullName") || "",
      companyId: d.get("companyId") || "",
    }));

    return NextResponse.json({ ok: true, workers });
  } catch (e: any) {
    // If Firestore needs an index, you'll see a FAILED_PRECONDITION here with a console link
    return NextResponse.json({ ok: false, error: e?.message || "Search failed" }, { status: 500 });
  }
}
