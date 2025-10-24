import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const snap = await db.collection("companies").orderBy("name").get();

    const companies = snap.docs.map((d) => {
      const data = d.data() || {};
      return { id: d.id, name: data.name ?? d.id };
    });

    return NextResponse.json({ ok: true, companies });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load companies" },
      { status: 500 }
    );
  }
}
