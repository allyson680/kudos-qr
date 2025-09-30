import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

export async function GET(req: NextRequest) {
  try {
    const targetCode = String(req.nextUrl.searchParams.get("target") || "").toUpperCase();
    if (!targetCode) {
      return NextResponse.json({ ok: false, error: "Missing target" }, { status: 400 });
    }
    const snap = await db
      .collection("notifications")
      .where("targetCode", "==", targetCode)
      .where("read", "==", false)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "GET failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // mark-as-read: { ids: string[] }
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (!ids.length) {
      return NextResponse.json({ ok: false, error: "No ids" }, { status: 400 });
    }
    const batch = db.batch();
    ids.forEach((id) => {
      batch.update(db.collection("notifications").doc(id), { read: true });
    });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "POST failed" }, { status: 500 });
  }
}
