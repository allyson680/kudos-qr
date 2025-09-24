import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";

const db = getDb();
const TZ = "America/Los_Angeles";

function fmt(now = new Date(), opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...opts }).format(now);
}
function dayKey(now = new Date()) {
  return `${fmt(now,{year:"numeric"})}-${fmt(now,{month:"2-digit"})}-${fmt(now,{day:"2-digit"})}`;
}
function monthKey(now = new Date()) {
  return `${fmt(now,{year:"numeric"})}-${fmt(now,{month:"2-digit"})}`;
}
function lastWednesdayOfMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth()+1, 0);
  const back = (d.getDay() - 3 + 7) % 7;
  d.setDate(d.getDate() - back);
  d.setHours(0,0,0,0);
  return d;
}
function isVotingOpen(now = new Date()) {
  return now < lastWednesdayOfMonth(now);
}

export async function POST(req: NextRequest) {
  try {
    const { voterCode, targetCode } = await req.json();
    const voter = String(voterCode || "").toUpperCase();
    const target = String(targetCode || "").toUpperCase();
    if (!voter || !target) {
      return NextResponse.json({ ok:false, error:"Missing voter/target code" }, { status:400 });
    }
    if (voter === target) {
      return NextResponse.json({ ok:false, error:"You can't vote for yourself" }, { status:400 });
    }

    // fetch voter + target worker docs
    const [voterSnap, targetSnap] = await Promise.all([
      db.collection("workers").doc(voter).get(),
      db.collection("workers").doc(target).get(),
    ]);
    if (!voterSnap.exists) return NextResponse.json({ ok:false, error:"Voter not registered" }, { status:400 });
    if (!targetSnap.exists) return NextResponse.json({ ok:false, error:"Target not registered" }, { status:400 });
    const voterDoc = voterSnap.data() as any;
    const targetDoc = targetSnap.data() as any;

    if (voterDoc.project !== targetDoc.project) {
      return NextResponse.json({ ok:false, error:"Different projects (NBK/JP) not allowed" }, { status:400 });
    }

    // const now = new Date();
    const now = new Date("2025-09-10T12:00:00Z"); // pick any safe test date

    if (!isVotingOpen(now)) {
      return NextResponse.json({ ok:false, error:"Voting is closed (last Wed → end of month)" }, { status:403 });
    }

    const dk = dayKey(now);
    const mk = monthKey(now);

    // count voter's votes today
    const voterTodaySnap = await db.collection("votes")
      .where("voterCode","==", voter)
      .where("dayKey","==", dk)
      .get();
    if (voterTodaySnap.size >= 3) {
      return NextResponse.json({ ok:false, error:"You’ve used 3 votes today" }, { status:400 });
    }

    // count company votes this month for this project
    const companyMonthSnap = await db.collection("votes")
      .where("project","==", voterDoc.project)
      .where("companyId","==", voterDoc.companyId)
      .where("monthKey","==", mk)
      .get();
    if (companyMonthSnap.size >= 30) {
      return NextResponse.json({ ok:false, error:"Your company reached 30 votes this month" }, { status:400 });
    }

    // write vote
    await db.collection("votes").add({
      createdAt: now.toISOString(),
      dayKey: dk,
      monthKey: mk,
      project: voterDoc.project,
      voterCode: voter,
      targetCode: target,
      companyId: voterDoc.companyId,
    });

    const leftToday = Math.max(0, 3 - (voterTodaySnap.size + 1));
    const leftCompany = Math.max(0, 30 - (companyMonthSnap.size + 1));

    return NextResponse.json({
      ok: true,
      message: `Vote recorded for ${target}. You have ${leftToday} left today. Your company has ${leftCompany} left this month.`,
      leftToday, leftCompany,
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || "Error" }, { status:500 });
  }
}
