import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

const db = getDb();

export async function POST(req: NextRequest) {
  try {
    const { reporterCode, targetCode } = await req.json();
    const reporter = String(reporterCode || "").toUpperCase();
    const target = String(targetCode || "").toUpperCase();
    if (!reporter || !target) {
      return NextResponse.json({ ok:false, error:"Missing reporter/target code" }, { status:400 });
    }
    if (reporter === target) {
      return NextResponse.json({ ok:false, error:"You can’t GC yourself" }, { status:400 });
    }

    const [repSnap, tarSnap] = await Promise.all([
      db.collection("workers").doc(reporter).get(),
      db.collection("workers").doc(target).get(),
    ]);
    if (!repSnap.exists) return NextResponse.json({ ok:false, error:"Reporter not registered" }, { status:400 });
    if (!tarSnap.exists) return NextResponse.json({ ok:false, error:"Target not registered" }, { status:400 });

    const rep = repSnap.data() as any;
    const tar = tarSnap.data() as any;

    // Walsh-only rule
    if (rep.companyId !== "c-walsh") {
      return NextResponse.json({ ok:false, error:"Only Walsh can submit Good Catch" }, { status:403 });
    }

    // Optional: Require same project
    if (rep.project !== tar.project) {
      return NextResponse.json({ ok:false, error:"Different projects (NBK/JP) not allowed" }, { status:400 });
    }

    await db.collection("good_catches").add({
      createdAt: new Date().toISOString(),
      project: rep.project,
      reporterCode: reporter,
      targetCode: target,
      reporterCompanyId: rep.companyId,
      targetCompanyId: tar.companyId,
    });

    return NextResponse.json({ ok: true, message: `Good Catch recorded for ${target}.` });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Error" }, { status:500 });
  }
}
