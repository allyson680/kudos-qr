import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

export async function POST() {
  const db = getDb();
  const initial = [
    { id: "c-acme", name: "ACME Construction" },
    { id: "c-bravo", name: "Bravo Builders" },
    { id: "c-cascade", name: "Cascade Electric" },
  ];
  const batch = db.batch();
  for (const c of initial) {
    batch.set(db.collection("companies").doc(c.id), { name: c.name });
  }
  await batch.commit();
  return NextResponse.json({ ok: true, added: initial.length });
}
