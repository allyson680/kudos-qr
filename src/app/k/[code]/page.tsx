"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

type Step = "profile" | "target" | "confirm" | "done";
type LockKind = "daily" | "company";

/* ---------- helpers ---------- */
function isGenericCodePrefix(str: string) {
  const t = (str || "").trim().toUpperCase();
  return t === "NBK" || t === "JP" || t === "NBK-" || t === "JP-";
}
async function readJsonSafe(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    const t = await res.text();
    return { ok: false, error: t?.slice(0, 200) || "Request failed" };
  } catch {
    return { ok: false, error: "Request failed" };
  }
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
  const isWalsh = (me?.companyId || companyId) === WALSH_COMPANY_ID;

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

  // auto-scroll target list
  const resultsRef = useRef<HTMLDivElement | null>(null);

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
    const json = await readJsonSafe(res);
    return (json as any)?.existing ?? null;
  }

  // Check both daily + monthly-company limits
  async function checkLimits(voter: string, companyId?: string) {
    try {
      const sp = new URLSearchParams({ voter });
      if (companyId) sp.set("companyId", companyId);
      const r = await fetch(`/api/vote/limits?${sp.toString()}`, {
        cache: "no-store",
      });
      const j: any = await readJsonSafe(r);
      if (j?.ok) {
        if (
          typeof j.companyMonthlyRemaining === "number" &&
          j.companyMonthlyRemaining <= 0
        ) {
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
        const json: any = await readJsonSafe(res);
        if (cancelled) return;

        setCompanies(Array.isArray(json?.companies) ? json.companies : []);

        if (json?.existing) {
          setMe(json.existing);
          setFullName(json.existing.fullName ?? "");
          setCompanyId(json.existing.companyId ?? "");
          await checkLimits(voterCode, json.existing.companyId ?? "");
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

  function resetTargetSearch() {
    setFilterCompanyId(""); // back to “All companies”
    setQuery("");
    setResults([]);
    setTargetCode("");
    setTargetName("");
  }

  // Search when on the target step (with NBK/JP prefix guard)
  useEffect(() => {
    if (step !== "target") return;

    const q = (query || "").trim();
    const tooBroad = isGenericCodePrefix(q);

    if (!filterCompanyId && (q.length < 3 || tooBroad)) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams();
        if (filterCompanyId) params.set("companyId", filterCompanyId);
        if (q) params.set("q", q);
        const r = await fetch(`/api/admin/workers?${params.toString()}`, {
          cache: "no-store",
        });
        const j: any = await readJsonSafe(r);
        if (!cancelled) setResults(Array.isArray(j?.workers) ? j.workers : []);
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

  // Auto-scroll to results after typing ≥3 or selecting a company
  useEffect(() => {
    if (step !== "target") return;
    if (isSearching) return;
    if (!resultsRef.current) return;
    const hasFilter = !!filterCompanyId;
    const hasLongQuery = query.trim().length >= 3;
    if (!hasFilter && !hasLongQuery) return;
    if (!results || results.length === 0) return;

    const y =
      resultsRef.current.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [step, filterCompanyId, query, isSearching, results.length]);

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
      const json: any = await readJsonSafe(res);
      if (json?.ok) {
        setMe(json.worker);
        setMsg(me ? "Updated!" : "Registered! You’re all set.");
        await checkLimits(voterCode, companyId);
        resetTargetSearch();
        setStep("target");
      } else {
        setMsg(json?.error || "Error");
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
    if (code === voterCode) {
      setFeedback("No self voting — please choose your coworker.");
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
      const j: any = await readJsonSafe(r);
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
      const json: any = await readJsonSafe(res);

      if (json?.ok) {
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
        const errMsg = (json?.error || "Error").toString();
        const err = errMsg.toLowerCase();
        if (err.includes("company")) {
          lockOut("company");
          return;
        }
        if (err.includes("daily")) {
          lockOut("daily");
          return;
        }
        if (err.includes("self")) {
          setFeedback("No self voting — please choose your coworker.");
          setStep("target");
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

          <div className="rounded border border-neutral-700 bg-neutral-900/80 text-neutral-100 shadow-md backdrop-blur-sm p-4">
            <div className="text-sm text-neutral-300">Sticker code</div>
            <div className="text-xl font-mono">{voterCode}</div>
            <div className="text-sm">
              Project: <b>{project}</b>
            </div>
          </div>

          <section className="space-y-3">
            <div className="rounded-xl border border-neutral-700 bg-neutral-900/80 text-neutral-100 shadow-md backdrop-blur-sm p-4 text-center">
              <p className="text-base font-medium">
                {lockMsg ||
                  "You’ve given all your tokens for today. Come back tomorrow."}
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
              {/* Company select (dark + auto-close) */}
              <div className="relative dark-form">
                <select
                  className="dark-select w-full"
                  value={companyId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCompanyId(v);
                    (e.target as HTMLSelectElement).blur(); // auto-close
                  }}
                  aria-label="Select company"
                  required
                >
                  <option value="">Select a company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? c.id}
                    </option>
                  ))}
                </select>
                <span className="select-chev">▼</span>
              </div>
            </label>
            <button
              onClick={saveProfile}
              className="w-full py-3 rounded bg-black text-white disabled:opacity-50"
              disabled={!fullName.trim() || !companyId}
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              className="w-full py-2 rounded border border-gray-400 text-gray-700 dark:text-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
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
              {/* Walsh-only: choose token type here on the target step */}
              {isWalsh ? (
                <>
                  <div className="mt-3 flex items-center justify-center gap-4">
                    <TypeBadge
                      type="token"
                      size="lg"
                      interactive
                      selected={voteType === "token"}
                      onClick={() => setVoteType("token")}
                    />
                    <TypeBadge
                      type="goodCatch"
                      size="lg"
                      interactive
                      selected={voteType === "goodCatch"}
                      onClick={() => setVoteType("goodCatch")}
                    />
                  </div>
                  <p className="text-xs text-center text-gray-300 mt-2">
                    Tap a token above, then scan or search your coworker.
                  </p>
                </>
              ) : (
                // non-Walsh just shows the token (not selectable)
                <div className="mt-3 flex justify-center">
                  <TypeBadge type="token" size="lg" />
                </div>
              )}
            </div>

            <div className="rounded border overflow-hidden">
              <div className="aspect-[4/3] bg-black/5"></div>
            </div>

            <div className="flex gap-2">
              <input
                className="flex-1 border rounded p-2"
                placeholder="Coworker code (nbk1 / JP001)"
                value={targetCode}
                onChange={(e) => setTargetCode(e.target.value)}
              />
            </div>

            {/* 🔎 Search & Filter */}
            <div className="rounded border p-3 space-y-2">
              <div className="flex flex-col gap-2">
                <input
                  className="w-full border rounded p-2 bg-neutral-900 text-white border-neutral-700 placeholder:text-neutral-400"
                  placeholder="Search name or code (Sam, nbk1 / JP001)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  className="w-full border rounded p-2 bg-neutral-900 text-white border-neutral-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={filterCompanyId}
                  onChange={(e) => {
                    setFilterCompanyId(e.target.value);
                    (e.target as HTMLSelectElement).blur(); // auto-close native picker
                  }}
                  title="Filter by company"
                >
                  <option value="" className="bg-neutral-900 text-white">
                    All companies
                  </option>
                  {companies.map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                      className="bg-neutral-900 text-white"
                    >
                      {c.name ?? c.id}
                    </option>
                  ))}
                </select>
              </div>

              <div ref={resultsRef}>
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
                          <div className="text-xs text-neutral-400">
                            {w.code}
                          </div>
                        </div>
                        <button
                          className="px-3 py-1 rounded bg-black text-white"
                          onClick={() => {
                            if (getProjectFromCode(w.code) !== project) {
                              setMsg("Same-project only (NBK→NBK, JP→JP)");
                              return;
                            }
                            if (w.code === voterCode) {
                              setFeedback(
                                "No self voting — please choose your coworker."
                              );
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
                    Search a name/code or filter by company.
                  </p>
                )}

                {/* Too-broad hint */}
                {!isSearching &&
                  !filterCompanyId &&
                  isGenericCodePrefix(query) && (
                    <p className="text-sm text-neutral-400 mt-2">
                      Too broad — add a few letters of a name or digits after
                      NBK/JP (e.g. NBK12).
                    </p>
                  )}
              </div>
            </div>

            {feedback && <p className="text-sm text-center">{feedback}</p>}
          </>
        )}

        {/* STEP 3 — confirm */}
        {step === "confirm" && (
          <section className="space-y-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/90 text-white p-4 shadow-lg">
              <p className="text-sm">
                Confirm token is for{" "}
                <b className="font-semibold">
                  {targetName ? `${targetName} (${targetCode})` : targetCode}
                </b>
                ?
              </p>
              <div className="mt-3 flex justify-center">
                <TypeBadge type={voteType} />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded border border-neutral-300"
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
          </section>
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
                onClick={() => {
                  resetTargetSearch();
                  setMsg("");
                  setStep("target");
                }}
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
