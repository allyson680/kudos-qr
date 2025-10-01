import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { normalizeSticker, toDashed } from "@/lib/codeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  const db = getDb();
  try {
    const companyId = (req.nextUrl.searchParams.get("companyId") || "").trim();
    const q = (req.nextUrl.searchParams.get("q") || "").trim();

    let ref: FirebaseFirestore.Query = db.collection("workers");

    if (companyId) {
      ref = ref.where("companyId", "==", companyId);
    }

    // If there's a query, try code first (NBK2 -> NBK0002), then fall back to name filtering
    if (q) {
      const qUpper = q.toUpperCase();
      const qPlain = qUpper.replace(/[^A-Z0-9]/g, "");

      // Is it "code-like" at all? (e.g., NBK12, JP001, etc.)
      if (/^[A-Z]+\d+$/.test(qPlain)) {
        const norm = normalizeSticker(qUpper); // pads to NBK0002, etc.
        // Try no-dash id first
        let doc = await db.collection("workers").doc(norm).get();
        if (!doc.exists) {
          // Try dashed legacy id
          const dashed = toDashed(norm);
          doc = await db.collection("workers").doc(dashed).get();
        }
        if (doc.exists) {
          return NextResponse.json({
            workers: [{ code: doc.id, ...(doc.data() as any) }],
          });
        }
        // If we didn't find by code, we STILL fall through to name search
      }

      // Name/code contains search (client-side filter over a page)
      // For production-scale search, consider storing "fullNameLower" and adding indexes.
      const snap = await ref.limit(500).get();
      const term = q.toLowerCase();
      const items = snap.docs
        .map(d => ({ code: d.id, ...(d.data() as any) }))
        .filter((w: any) => {
          const name = String(w.fullName || "").toLowerCase();
          const codeStr = String(w.code || "");
          return name.includes(term) || codeStr.includes(qUpper);
        });

      return NextResponse.json({ workers: items });
    }

    // No q: list by company (or first page if neither set)
    const snap = await ref.limit(500).get();
    const items = snap.docs.map(d => ({ code: d.id, ...(d.data() as any) }));
    return NextResponse.json({ workers: items });
  } catch (e: any) {
    return NextResponse.json({ workers: [], error: e?.message || "Error" }, { status: 500 });
  }
}
