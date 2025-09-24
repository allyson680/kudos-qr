import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") || "").toUpperCase();
  // companies
  const companiesSnap = await db.collection("companies").get();
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  // existing worker (by code)
  const workerSnap = code ? await db.collection("workers").doc(code).get() : null;
  const existing = workerSnap?.exists ? { code, ...(workerSnap!.data() as any) } : null;
  return NextResponse.json({ companies, existing });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body.code || "").toUpperCase();
    const project = String(body.project || "").toUpperCase();
    const fullName = String(body.fullName || "").trim();
    const companyId = String(body.companyId || "");

    if (!code || !project || !fullName || !companyId) {
      return NextResponse.json({ ok:false, error:"Missing fields" }, { status:400 });
    }
    if (!(project === "NBK" || project === "JP")) {
      return NextResponse.json({ ok:false, error:"Invalid project" }, { status:400 });
    }

    // upsert worker (doc id = sticker code)
    await db.collection("workers").doc(code).set({
      code,
      project,
      fullName,
      companyId,
      createdAt: new Date().toISOString(),
    }, { merge: true });

    const worker = { code, project, fullName, companyId };
    return NextResponse.json({ ok:true, worker });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Error" }, { status:500 });
  }
}
