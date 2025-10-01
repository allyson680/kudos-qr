// src/app/k/[code]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { normalizeSticker, getProjectFromCode } from "@/lib/codeUtils";
import TypeBadge from "@/components/TypeBadge";
import {
  getNextOutOfTokensMessage,
  getNextCompanyCapMessage,
} from "@/lib/outOfTokens";

type Company = { id: string; name?: string };
type Worker = {
  code: string;
  project: "NBK" | "JP";
  fullName: string;
  companyId: string;
};

const WALSH_COMPANY_ID = "WALSH";
const QrScanner = dynamic(() => import("@/Company/QRScanner"), { ssr: false });

type Step = "profile" | "target" | "confirm" | "done";
type LockKind = "daily" | "company";

/* ------------------------- CompanySelect (dropdown) ------------------------ */
function CompanySelect({
  companies,
  value,
  onChange,
}: {
  companies: { id: string; name?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const qLower = q.toLowerCase();

  const filtered = (companies ?? [])
    .filter(
      (c): c is { id: string; name?: string } => !!c && typeof c.id === "string"
    )
    .filter((c) => {
      const nameLower = (c.name ?? "").toLowerCase();
      const idLower = c.id.toLowerCase();
      return nameLower.includes(qLower) || idLower.includes(qLower);
    })
    .slice(0, 50);

  const selected = (companies ?? []).find((c) => c && c.id === value);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="w-full border rounded p-2 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? selected.name ?? selected.id : "Select company"}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full border rounded bg-white shadow">
          <input
            className="w-full p-2 border-b outline-none"
            placeholder="Search company…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="max-h-60 overflow-auto" role="listbox">
            {filtered.length ? (
              filtered.map((c) => (
                <div
                  key={c.id}
                  role="option"
                  aria-selected={c.id === value}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                    c.id === value ? "bg-gray-50" : ""
                  }`}
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  {c.name ?? c.id}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function CodePage({ params }: { params: { code: string } }) {
  // Canonical code (NBK1 -> NBK0001)
  const voterCode = useMemo(
    () => normalizeSticker(decodeURIComponent(params.code || "")),
    [params.code]
  );
  const project = getProjectFromCode(voterCode);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [me, setMe] = useState<Worker | null>(null);
  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [msg, setMsg] = useState("");

  const [voteType, setVoteType] = useState<"token" | "goodCatch">("token");
  const isWalsh = me?.companyId === WALSH_COMPANY_ID;

  const [step, setStep] = useState<Step>("profile");

  const [targetCode, setTargetCode] = useState("");
  const [targetName, setTargetName] = useState("");
  const [feedback, setFeedback] = useState("");

  // 🔎 search/filter (target step only)
  const [filterCompanyId, setFilterCompanyId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Worker[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Toast
  const [toast, setToast] = useState<string>("");

  // Locks
  const [dailyLocked, setDailyLocked] = useState(false);
  const [lockMsg, setLockMsg] = useState("");

  const lockOut = (kind: LockKind = "daily") => {
    setDailyLocked(true);
    setLockMsg(
      kind === "company"
        ? getNextCompanyCapMessage()
        : getNextOutOfTokensMessage()
    );
  };

  async function apiLookup(code: string): Promise<Worker | null> {
    const res = await fetch(`/api/register?code=${encodeURIComponent(code)}`, {
      cache: "no-store",
    });
    const json = await res.json();
    return json?.existing ?? null;
  }

  // Check both daily + monthly-company limits
  async function checkLimits(voter: string, companyId?: string) {
    try {
      const sp = new URLSearchParams({ voter });
      if (companyId) sp.set("companyId", companyId);
      const r = await fetch(`/api/vote/limits?${sp.toString()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (j?.ok) {
        if (typeof j.companyRemaining === "number" && j.companyRemaining <= 0) {
          lockOut("company");
          return;
        }
        if (typeof j.dailyRemaining === "number" && j.dailyRemaining <= 0) {
          lockOut("daily");
          return;
        }
        setDailyLocked(false);
      } else {
        setDailyLocked(false);
      }
    } catch {
      setDailyLocked(false);
    }
  }

  // Load profile & pre-lock if capped
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/register?code=${encodeURIComponent(voterCode)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (cancelled) return;

        setCompanies(Array.isArray(json.companies) ? json.companies : []);

        if (json.existing) {
          setMe(json.existing);
          setFullName(json.existing.fullName ?? "");
          setCompanyId(json.existing.companyId ?? "");
          await checkLimits(voterCode, json.existing.companyId ?? "");
          // stay on "profile" until they tap Continue
        } else {
          setMe(null);
          setFullName("");
          setCompanyId("");
          setStep("profile");
          setDailyLocked(false);
        }
      } catch (e: any) {
        setMsg(e?.message || "Failed to load data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [voterCode]);

  // Search when on the target step
  useEffect(() => {
    if (step !== "target") return;

    if (!filterCompanyId && !query.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams();
        if (filterCompanyId) params.set("companyId", filterCompanyId);
        if (query.trim()) params.set("q", query.trim());
        const r = await fetch(`/api/admin/workers?${params.toString()}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!cancelled) setResults(Array.isArray(j.workers) ? j.workers : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, filterCompanyId, query, project]);

  async function saveProfile() {
    setMsg("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: voterCode,
          project,
          fullName: fullName.trim(),
          companyId,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setMe(json.worker);
        setMsg(me ? "Updated!" : "Registered! You’re all set.");
        await checkLimits(voterCode, companyId);
        setStep("target");
      } else {
        setMsg(json.error || "Error");
      }
    } catch (e: any) {
      setMsg(e?.message || "Network error");
    }
  }

  async function fetchTargetInfo(raw: string) {
    setFeedback("");
    if (!raw || !raw.trim()) {
      setFeedback("Enter a coworker code or scan.");
      return;
    }
    const code = normalizeSticker(raw);
    if (!code) {
      setFeedback("Invalid code format.");
      return;
    }
    if (getProjectFromCode(code) !== project) {
      setFeedback("Same-project only (NBK→NBK, JP→JP)");
      return;
    }

    try {
      const r = await fetch(`/api/register?code=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (!j?.existing) {
        setFeedback(
          "We couldn't find that sticker. Ask your coworker to register first."
        );
        return;
      }
      setTargetCode(code);
      setTargetName(j.existing.fullName ?? "");
      setStep("confirm");
    } catch {
      setFeedback("Lookup failed. Try again.");
    }
  }

  async function submitVote() {
    setFeedback("");
    try {
      const body: any = { voterCode, targetCode };
      if (isWalsh) body.voteType = voteType;

      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (json.ok) {
        // Hard-stop UI if caps just hit zero
        if (
          typeof json.companyRemaining === "number" &&
          json.companyRemaining <= 0
        ) {
          lockOut("company");
          return;
        }
        if (
          typeof json.companyMonthlyRemaining === "number" &&
          json.companyMonthlyRemaining <= 0
        ) {
          lockOut("company");
          return;
        }
        if (
          typeof json.dailyRemaining === "number" &&
          json.dailyRemaining <= 0
        ) {
          lockOut("daily");
          return;
        }

        const code = json.target?.code || targetCode;
        const name = (json.target?.fullName || targetName || "").trim();
        setFeedback(
          json.message || `Vote for ${name || code} (${code}) recorded`
        );
        setToast(
          `${json.voteType === "goodCatch" ? "Good Catch" : "Token"} sent to ${
            name || code
          }! 🎉`
        );
        setStep("done");
      } else {
        const errMsg = json.error || "Error";
        const err = errMsg.toLowerCase();
        if (err.includes("company")) {
          lockOut("company");
          return;
        }
        if (err.includes("daily")) {
          lockOut("daily");
          return;
        }
        setFeedback(errMsg);
        setStep("target");
      }
    } catch (e: any) {
      setFeedback(e?.message || "Network error");
      setStep("target");
    }
  }

  /* ------------------------------ Locked view ------------------------------ */
  if (dailyLocked) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-center">Your Sticker</h1>
          <div className="rounded border p-3">
            <div className="text-sm text-gray-500">Sticker code</div>
            <div className="text-xl font-mono">{voterCode}</div>
            <div className="text-sm">
              Project: <b>{project}</b>
            </div>
          </div>
          <section className="space-y-3">
            <div className="rounded border p-4 bg-gray-50 text-center">
              <p className="text-base font-medium">
                {lockMsg ||
                  "You’ve given all 3 tokens for today. Come back tomorrow."}
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  /* ------------------------------ Normal UI -------------------------------- */
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-center">Your Sticker</h1>

        <div className="rounded border p-3">
          <div className="text-sm text-gray-500">Sticker code</div>
          <div className="text-xl font-mono">{voterCode}</div>
          <div className="text-sm">
            Project: <b>{project}</b>
          </div>
        </div>

        {/* STEP 1 — profile */}
        {step === "profile" && (
          <>
            {me && (
              <div className="rounded border p-3 bg-green-50">
                <p className="font-medium">Registered</p>
                <p>Name: {me.fullName}</p>
                <p>
                  Company:{" "}
                  {companies.find((c) => c.id === me.companyId)?.name ||
                    me.companyId}
                </p>
              </div>
            )}

            <label className="block">
              <span className="text-sm">Your full name</span>
              <input
                className="w-full border rounded p-2"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="First Last"
              />
            </label>

            <label className="block">
              <span className="text-sm">Company</span>
              <CompanySelect
                companies={companies}
                value={companyId}
                onChange={setCompanyId}
              />
            </label>

            {/* Walsh chooses vote type; others default to Token */}
            {companyId === WALSH_COMPANY_ID && (
              <div className="flex gap-2 justify-center">
                <button
                  className={`px-3 py-1 rounded border ${
                    voteType === "token" ? "bg-black text-white" : ""
                  }`}
                  onClick={() => setVoteType("token")}
                >
                  Token of Excellence
                </button>
                <button
                  className={`px-3 py-1 rounded border ${
                    voteType === "goodCatch" ? "bg-black text-white" : ""
                  }`}
                  onClick={() => setVoteType("goodCatch")}
                >
                  Good Catch
                </button>
              </div>
            )}

            <button
              onClick={saveProfile}
              className="w-full py-3 rounded bg-black text-white disabled:opacity-50"
              disabled={!fullName.trim() || !companyId}
            >
              Continue
            </button>
          </>
        )}

        {/* STEP 2 — target */}
        {step === "target" && (
          <>
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-100 text-gray-900 shadow-sm dark:bg-gray-900/70 dark:text-white dark:border-gray-700">
              <p className="text-sm leading-relaxed">
                Hello <b>{fullName || voterCode}</b>, who would you like to give
                a virtual token to?
              </p>
              <div className="mt-3 flex justify-center">
                <TypeBadge type={voteType} />
              </div>
            </div>

            <div className="rounded border overflow-hidden">
              <div className="aspect-[4/3] bg-black/5">
                <QrScanner
                  onScan={(text: string | null) =>
                    text && fetchTargetInfo(text)
                  }
                  onError={(err: Error) => setFeedback(err.message)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <input
                className="flex-1 border rounded p-2"
                placeholder="Coworker code (e.g., NBK1 / JP001)"
                value={targetCode}
                onChange={(e) => setTargetCode(e.target.value)}
              />
              <button
                className="px-4 rounded bg-black text-white"
                onClick={() => fetchTargetInfo(targetCode)}
              >
                Next
              </button>
            </div>

            {/* 🔎 Search & Filter */}
            <div className="rounded border p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded p-2"
                  placeholder="Search by name or code (e.g., Maria, NBK12)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  className="border rounded p-2"
                  value={filterCompanyId}
                  onChange={(e) => setFilterCompanyId(e.target.value)}
                  title="Filter by company"
                >
                  <option value="">All companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? c.id}
                    </option>
                  ))}
                </select>
              </div>

              {isSearching ? (
                <p className="text-sm text-gray-500">Searching…</p>
              ) : results.length ? (
                <ul className="divide-y border rounded">
                  {results.map((w) => (
                    <li
                      key={w.code}
                      className="flex items-center justify-between p-2"
                    >
                      <div>
                        <div className="font-medium">
                          {w.fullName || "(no name yet)"}
                        </div>
                        <div className="text-xs text-gray-600">{w.code}</div>
                      </div>
                      <button
                        className="px-3 py-1 rounded bg-black text-white"
                        onClick={() => {
                          if (getProjectFromCode(w.code) !== project) {
                            setFeedback("Same-project only (NBK→NBK, JP→JP)");
                            return;
                          }
                          setTargetCode(w.code);
                          setTargetName(w.fullName || "");
                          setStep("confirm");
                        }}
                      >
                        Select
                      </button>
                    </li>
                  ))}
                </ul>
              ) : filterCompanyId || query.trim() ? (
                <p className="text-sm text-gray-500">No matches found.</p>
              ) : (
                <p className="text-xs text-gray-500">
                  Tip: filter by company or search a name/code.
                </p>
              )}
            </div>

            {feedback && <p className="text-sm text-center">{feedback}</p>}
          </>
        )}

        {/* STEP 3 — confirm */}
        {step === "confirm" && (
          <>
            <div className="rounded border p-3 bg-gray-50">
              <p className="text-sm">
                Confirm vote for{" "}
                <b>
                  {targetName ? `${targetName} (${targetCode})` : targetCode}
                </b>
                ?
              </p>
              <div className="mt-2 flex justify-center">
                <TypeBadge type={voteType} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded border"
                onClick={() => setStep("target")}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-2 rounded bg-black text-white"
                onClick={submitVote}
              >
                Confirm
              </button>
            </div>
          </>
        )}

        {/* STEP 4 — done */}
        {step === "done" && (
          <>
            <p className="text-center">
              {feedback || `Vote for ${targetName || targetCode} recorded`}
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded border"
                onClick={() => setStep("target")}
              >
                Vote again
              </button>
            </div>
          </>
        )}

        {msg && <p className="text-center text-sm">{msg}</p>}
      </div>

      {/* simple toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-black text-white px-4 py-2 rounded shadow text-sm flex items-center gap-3">
            <span>{toast}</span>
            <button className="text-xs underline" onClick={() => setToast("")}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
