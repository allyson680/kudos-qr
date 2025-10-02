// src/app/scan-vote/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { normalizeSticker, getProjectFromCode } from "@/lib/codeUtils";
import TypeBadge from "@/components/TypeBadge";

import {
  getNextOutOfTokensMessage,
  getNextCompanyCapMessage,
} from "@/lib/outOfTokens";

type Worker = { code: string; fullName: string; companyId: string };
type Company = { id: string; name: string };

const WALSH_COMPANY_ID = "WALSH";
const QrScanner = dynamic(() => import("@/Company/QRScanner"), { ssr: false });

type Step = "voter" | "target" | "confirm" | "done";
type LockKind = "daily" | "company";

export default function ScanVotePage() {
  const router = useRouter();

  // step
  const [step, setStep] = useState<Step>("voter");

  // voter
  const [voterCode, setVoterCode] = useState("");
  const [voterName, setVoterName] = useState("");
  const [voterCompanyId, setVoterCompanyId] = useState("");
  const voterProject = useMemo(
    () => (voterCode ? getProjectFromCode(voterCode) : "NBK"),
    [voterCode]
  );
  const isWalsh = voterCompanyId === WALSH_COMPANY_ID;

  // vote type (Walsh only)
  const [voteType, setVoteType] = useState<"token" | "goodCatch">("token");

  // target
  const [targetCode, setTargetCode] = useState("");
  const [targetName, setTargetName] = useState("");

  // search/filter (target step only)
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filterCompanyId, setFilterCompanyId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Worker[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // ui messages
  const [msg, setMsg] = useState("");

  // locks
  const [locked, setLocked] = useState(false);
  const [lockMsg, setLockMsg] = useState("");

  const lockOut = (kind: LockKind = "daily") => {
    setLocked(true);
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

  // Check both limits (daily + company monthly)
  async function checkLimits(voter: string, companyId?: string) {
    try {
      const params = new URLSearchParams({ voter });
      if (companyId) params.set("companyId", companyId);
      const r = await fetch(`/api/vote/limits?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (j?.ok) {
        const comp =
          typeof j.companyRemaining === "number"
            ? j.companyRemaining
            : j.companyMonthlyRemaining;
        if (typeof comp === "number" && comp <= 0) return lockOut("company");
        if (typeof j.dailyRemaining === "number" && j.dailyRemaining <= 0)
          return lockOut("daily");
        setLocked(false);
      } else {
        setLocked(false);
      }
    } catch {
      setLocked(false);
    }
  }

  // ── handlers ────────────────────────────────────────────────────────────────

  async function fetchVoterInfo(raw: string) {
    setMsg("");
    const code = normalizeSticker(raw);
    if (!code) return;

    setVoterCode(code);
    const w = await apiLookup(code);

    if (!w) {
      setVoterName("");
      setVoterCompanyId("");
      setMsg("We didn’t find your code. Redirecting to register…");
      setTimeout(() => router.push(`/k/${code}`), 300);
      return;
    }

    setVoterName(w.fullName ?? "");
    setVoterCompanyId(w.companyId ?? "");
    await checkLimits(code, w.companyId ?? "");
    setStep("target");
  }

  async function fetchTargetInfo(raw: string) {
    setMsg("");
    const code = normalizeSticker(raw);
    if (!code) return;

    // same-project guard (server enforces too)
    if (getProjectFromCode(code) !== voterProject) {
      setMsg("Same-project only (NBK→NBK, JP→JP)");
      return;
    }

    // Require existing target
    const w = await apiLookup(code);
    if (!w) {
      setMsg(
        "We couldn't find that sticker. Ask your coworker to register first."
      );
      return;
    }

    setTargetCode(code);
    setTargetName(w.fullName ?? "");
    setStep("confirm");
  }

  async function submitVote() {
    setMsg("");
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
        const comp =
          typeof json.companyRemaining === "number"
            ? json.companyRemaining
            : json.companyMonthlyRemaining;
        if (typeof comp === "number" && comp <= 0) return lockOut("company");
        if (typeof json.dailyRemaining === "number" && json.dailyRemaining <= 0)
          return lockOut("daily");

        const code = json.target?.code || targetCode;
        const name = (json.target?.fullName || targetName || "").trim();
        setMsg(json.message || `Vote for ${name || code} (${code}) recorded`);
        setStep("done");
      } else {
        const err = (json.error || "").toLowerCase();
        if (err.includes("company")) return lockOut("company");
        if (err.includes("daily")) return lockOut("daily");
        setMsg(json.error || "Error");
        setStep("target");
      }
    } catch (e: any) {
      setMsg(e?.message || "Network error");
      setStep("target");
    }
  }

  // ── effects ────────────────────────────────────────────────────────────────

  // Load companies when entering target step (for filter dropdown)
  useEffect(() => {
    if (step !== "target") return;
    (async () => {
      try {
        const res = await fetch("/api/register", { cache: "no-store" });
        const json = await res.json();
        setCompanies(Array.isArray(json.companies) ? json.companies : []);
      } catch {
        // ignore
      }
    })();
  }, [step]);

  // Search workers on target step
  function resetTargetSearch() {
  setFilterCompanyId("");   // back to “All companies”
  setQuery("");             // clear search text
  setResults([]);           // clear old results
  setTargetCode("");        // clear manual code input
  setTargetName("");
}

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
        const url = `/api/admin/workers?${params.toString()}`;
        const r = await fetch(url, { cache: "no-store" });
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
  }, [step, filterCompanyId, query]);

  // ── locked view ────────────────────────────────────────────────────────────
  if (locked) {
    return (
      <main className="p-4 max-w-md mx-auto space-y-4">
        <section className="space-y-3">
          <div className="rounded border p-4 bg-gray-50 text-center">
            <p className="text-base font-medium">
              {lockMsg ||
                "You’ve hit the limit for now. Please try again later."}
            </p>
          </div>
        </section>
      </main>
    );
  }

  // ── normal UI ──────────────────────────────────────────────────────────────
  return (
    <main className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-center">QR → QR Vote</h1>

      {/* STEP 1 — voter */}
      {step === "voter" && (
        <section className="space-y-3">
          <p className="text-sm text-gray-600">
            Scan <b>your</b> sticker, or type it (e.g., <code>NBK1</code> /{" "}
            <code>JP001</code>).
          </p>

          <div className="rounded border overflow-hidden">
            <div className="aspect-[4/3] bg-black/5">
              <QrScanner
                onScan={(t) => t && fetchVoterInfo(t)}
                onError={(e) => setMsg(e.message)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 border rounded p-2"
              placeholder="Your code"
              value={voterCode}
              onChange={(e) => setVoterCode(e.target.value)}
              inputMode="text"
              autoCapitalize="characters"
            />
            <button
              className="px-4 rounded bg-black text-white"
              onClick={() => fetchVoterInfo(voterCode)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {/* STEP 2 — target */}
      {step === "target" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-100 text-gray-900 shadow-sm dark:bg-gray-900/70 dark:text-white dark:border-gray-700">
            <p className="text-sm leading-relaxed">
              Hello{" "}
              <span className="font-semibold">{voterName || voterCode}</span>,
              who would you like to give a virtual token to?
            </p>
          </div>

          {/* Walsh-only: choose the token type here */}
          {isWalsh ? (
            <div className="rounded border p-3">
              <div className="text-sm mb-2">Choose token type:</div>
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
            </div>
          ) : (
            <div className="mt-4 flex justify-center">
              <TypeBadge type="token" />
            </div>
          )}

          <p className="text-sm text-gray-600">
            Scan coworker or use search box below.
          </p>

          <div className="rounded border overflow-hidden">
            <div className="aspect-[4/3] bg-black/5">
              <QrScanner
                onScan={(t) => t && fetchTargetInfo(t)}
                onError={(e) => setMsg(e.message)}
              />
            </div>
          </div>

          {/* Search & Filter */}
          <div className="rounded border p-3 space-y-2">
            <div className="space-y-2">
              <input
                className="w-full border rounded p-2 bg-neutral-900 text-white placeholder-gray-400"
                placeholder="Search by name or code (e.g., Maria, NBK12)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    setQuery((e.target as HTMLInputElement).value);
                }}
              />

              {/* full-width, dark select below the search input */}
              <div className="relative">
                <select
                  className="dark-select w-full border rounded p-2 pr-9"
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
                <svg
                  className="select-chev"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </div>
            </div>

            {isSearching ? (
              <p className="text-sm text-neutral-400">Searching…</p>
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
                      <div className="text-xs text-neutral-400">{w.code}</div>
                    </div>
                    <button
                      className="px-3 py-1 rounded bg-black text-white"
                      onClick={() => {
                        if (getProjectFromCode(w.code) !== voterProject) {
                          setMsg("Same-project only (NBK→NBK, JP→JP)");
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
              <p className="text-sm text-neutral-400">No matches found.</p>
            ) : (
              <p className="text-xs text-neutral-500">
                Tip: filter by company or search a name/code.
              </p>
            )}
          </div>
        </section>
      )}

      {/* STEP 3 — confirm */}
      {step === "confirm" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-100 text-gray-900 shadow-sm dark:bg-gray-900/70 dark:text-white dark:border-gray-700">
            <p className="text-sm">
              Confirm token is for{" "}
              <b>{targetName ? `${targetName} (${targetCode})` : targetCode}</b>
              ?
            </p>
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
          <div className="mt-4 flex justify-center">
            <TypeBadge type={voteType} />
          </div>
        </section>
      )}

      {/* STEP 4 — done */}
      {step === "done" && (
        <section className="space-y-3">
          <p className="text-center">{msg}</p>
          <div className="flex gap-2">
            <button
  className="flex-1 py-2 rounded border"
  onClick={() => {
    resetTargetSearch();
    setMsg("");
    setStep("target");
  }}
>
  Vote again
</button>

          </div>
        </section>
      )}

      {msg && step !== "done" && <p className="text-sm text-center">{msg}</p>}
    </main>
  );
}
