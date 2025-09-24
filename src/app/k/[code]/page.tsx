"use client";
import { useEffect, useState } from "react";

type Company = { id: string; name: string };
type Worker = { code: string; project: "NBK" | "JP"; fullName: string; companyId: string };

export default function CodePage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code || "").toUpperCase();
  const project: "NBK" | "JP" = code.startsWith("JP-") ? "JP" : "NBK";

  const [gcTarget, setGcTarget] = useState("");
  const [gcMsg, setGcMsg] = useState("");
  const [showGcScanner, setShowGcScanner] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [existing, setExisting] = useState<Worker | null>(null);
  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [msg, setMsg] = useState<string>("");

  const [targetCode, setTargetCode] = useState("");
  const [voteMsg, setVoteMsg] = useState<string>("");
  const [autoOpened, setAutoOpened] = useState(false);


  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/register?code=${encodeURIComponent(code)}`);
      const json = await res.json();
      setCompanies(json.companies || []);
      if (json.existing) {
        setExisting(json.existing);
        setFullName(json.existing.fullName);
        setCompanyId(json.existing.companyId);
      }
    })();
  }, [code]);

  async function claim() {
    setMsg("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ code, project, fullName, companyId })
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Registered! You’re all set.");
      setExisting(json.worker);
    } else {
      setMsg(json.error || "Error");
    }
  }

  // Auto-open vote scanner if page has ?scan=1 OR always open once after registration detected
const url = new URL(window.location.href);
if ((url.searchParams.get('scan') === '1' || existing) && !autoOpened) {
  setAutoOpened(true);
  setShowScanner(true); // for VOTE scanner
}


  async function submitGc() {
  setGcMsg("");
  const reporterCode = code;
  const t = gcTarget.trim().toUpperCase();
  if (!t) { setGcMsg("Enter coworker code"); return; }
  const res = await fetch("/api/gc", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ reporterCode, targetCode: t }),
  });
  const json = await res.json();
  if (json.ok) setGcMsg(json.message || "Good Catch recorded");
  else setGcMsg(json.error || "Error");
}

// scanner
{showGcScanner && (
  <QrScanner
    onClose={()=>setShowGcScanner(false)}
    onResult={(text) => {
      try {
        const u = new URL(text);
        const parts = u.pathname.split('/').filter(Boolean);
        const codeFromUrl = parts[1] || '';
        if (codeFromUrl) setGcTarget(codeFromUrl.toUpperCase());
        else setGcTarget(text.toUpperCase());
      } catch {
        setGcTarget(text.toUpperCase());
      }
      setShowGcScanner(false);
    }}
  />
)}


  async function castVote() {
    setVoteMsg("");
    const voterCode = code; // this page’s code is the voter
    const t = targetCode.trim().toUpperCase();
    if (!t) { setVoteMsg("Enter coworker sticker code"); return; }
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ voterCode, targetCode: t })
    });
    const json = await res.json();
    if (json.ok) setVoteMsg(json.message || "Vote recorded");
    else setVoteMsg(json.error || "Error");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">Sticker</h1>

        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Sticker code</div>
          <div className="text-xl font-mono">{code}</div>
          <div className="text-sm">Project: <b>{project}</b></div>
        </div>

        {existing ? (
          <div className="rounded border p-3 bg-green-50">
            <p className="font-medium">Registered</p>
            <p>Name: {existing.fullName}</p>
            <p>Company: {companies.find(c => c.id === existing.companyId)?.name || existing.companyId}</p>
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm">Your full name</span>
          <input
            className="w-full border rounded p-2"
            value={fullName}
            onChange={e=>setFullName(e.target.value)}
            placeholder="First Last"
          />
        </label>

        <label className="block">
          <span className="text-sm">Company</span>
          <select
            className="w-full border rounded p-2"
            value={companyId}
            onChange={e=>setCompanyId(e.target.value)}
          >
            <option value="">Select company</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <button
          onClick={claim}
          className="w-full py-3 rounded bg-black text-white disabled:opacity-50"
          disabled={!fullName.trim() || !companyId}
        >
          {existing ? "Update" : "Claim"}
        </button>

        {msg && <p className="text-center text-sm">{msg}</p>}

        {/* --- Voting box --- */}
        <hr className="my-4" />
        <h2 className="text-xl font-semibold text-center">Cast a vote</h2>
        <p className="text-sm text-center text-gray-600">
          Enter your coworker’s sticker code (same project).
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded p-2"
            placeholder="e.g., NBK-0002"
            value={targetCode}
            onChange={e=>setTargetCode(e.target.value)}
          />
          <button onClick={castVote} className="px-4 rounded bg-black text-white">Vote</button>
        </div>
        {voteMsg && <p className="text-center text-sm">{voteMsg}</p>}
      </div>
      <hr className="my-4" />
<h2 className="text-xl font-semibold text-center">Good Catch (Walsh only)</h2>
<p className="text-sm text-center text-gray-600">Scan or enter coworker’s sticker code.</p>
<div className="flex gap-2">
  <input
    className="flex-1 border rounded p-2"
    placeholder="e.g., NBK-0002"
    value={gcTarget}
    onChange={e=>setGcTarget(e.target.value)}
  />
  <button onClick={submitGc} className="px-4 rounded bg-black text-white">Submit</button>
  <button onClick={()=>setShowGcScanner(true)} className="px-4 rounded border">Scan QR</button>
</div>
{gcMsg && <p className="text-center text-sm">{gcMsg}</p>}

    </main>
  );
}
