"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { normalizeSticker, getProjectFromCode } from "@/lib/codeUtils";
import TypeBadge from "@/components/TypeBadge";
import {
  getNextOutOfTokensMessage,
  getNextCompanyCapMessage,
} from "@/lib/outOfTokens";

type Worker = { code: string; fullName: string; companyId: string };
type Company = { id: string; name: string };

const WALSH_COMPANY_ID = "WALSH";

type Step = "voter" | "target" | "confirm" | "done";
type LockKind = "daily" | "company";

type FeedbackModalProps = {
  onClose: () => void;
  project: string;
  voterCode: string;
  voterCompanyId: string;
};

const FeedbackModal = dynamic<FeedbackModalProps>(
  () => import("@/components/FeedbackModal"),
  { ssr: false }
);

/* ---------- helpers ---------- */

// Pull code from raw text, URL, or QR payload
function extractStickerFromText(raw: string): string | null {
  if (!raw) return null;
  const t = raw.trim();

  const m = t.match(/\b(?:NBK|JP)-?\d{1,4}\b/i);
  if (m) return normalizeSticker(m[0]);

  try {
    const u = new URL(t);
    const parts = u.pathname.split("/").filter(Boolean);
    const kIdx = parts.indexOf("k");
    if (kIdx !== -1 && parts[kIdx + 1]) return normalizeSticker(parts[kIdx + 1]);
    const qp = u.searchParams.get("voter") || u.searchParams.get("code");
    if (qp) return normalizeSticker(qp);
  } catch {
    /* not a URL */
  }

  return normalizeSticker(t);
}

// Treat bare prefixes as “too broad” so the list doesn’t explode
function isGenericCodePrefix(str: string) {
  const t = (str || "").trim().toUpperCase();
  return t === "NBK" || t === "JP" || t === "NBK-" || t === "JP-";
}

// Safe JSON so HTML error pages don’t crash the client
async function readJsonSafe(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {}
  }
  try {
    const t = await res.text();
    return { ok: false, error: t?.slice(0, 200) || "Request failed" };
  } catch {
    return { ok: false, error: "Request failed" };
  }
}

// Local feedback gate (fallback if server doesn't tell us)
const LS_VOTES_KEY = "fb_votesGiven";
const LS_LAST_FB_KEY = "fb_lastFeedbackAt";

function shouldPromptFeedbackLocal(): boolean {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(LS_LAST_FB_KEY) || "0");
    const votes = Number(localStorage.getItem(LS_VOTES_KEY) || "0") + 1;
    const twentyDays = 20 * 24 * 60 * 60 * 1000;

    if (votes < 2) return false; // never on first vote

    const countOk = votes % 21 === 0;
    const timeOk = last > 0 && now - last >= twentyDays;

    return countOk || timeOk;
  } catch {
    return false;
  }
}


export default function VotePageClient() {
  const qs = useSearchParams();
  const router = useRouter();

  const topRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);


  // 🌟 NEW: boot/loading state for first paint
  const [booting, setBooting] = useState(true);
  const [bootMsg, setBootMsg] = useState("Loading…");

  // Callouts
  const [selfCallout, setSelfCallout] = useState("");
  const [sameCompanyCallout, setSameCompanyCallout] = useState("");

  const showNoSelf = useCallback(() => {
    setSelfCallout(
      "No self-voting! Please choose a deserving coworker instead."
    );
    try {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const showNoSameCompany = useCallback(() => {
    setSameCompanyCallout(
      "No same-company voting! Please pick someone from a different company."
    );
    try {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const voterFromQS = normalizeSticker(qs.get("voter") || "");
  const typeFromQS = (qs.get("type") === "goodCatch" ? "goodCatch" : "token") as
    | "token"
    | "goodCatch";

  const [step, setStep] = useState<Step>(voterFromQS ? "target" : "voter");

  // voter
  const [voterCode, setVoterCode] = useState(voterFromQS);
  const [voterName, setVoterName] = useState("");
  const [voterCompanyId, setVoterCompanyId] = useState("");
  const voterProject = useMemo(
    () => (voterCode ? getProjectFromCode(voterCode) : "NBK"),
    [voterCode]
  );
  const isWalsh = voterCompanyId === WALSH_COMPANY_ID;

  // token type (Walsh only)
  const [voteType, setVoteType] = useState<"token" | "goodCatch">(typeFromQS);

  // target
  const [targetCode, setTargetCode] = useState("");
  const [targetName, setTargetName] = useState("");

  // search/filter
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filterCompanyId, setFilterCompanyId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Worker[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // scanner overlay control
  const [scanOpen, setScanOpen] = useState(false);
  const [msg, setMsg] = useState("");

  // lock state
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
    const j: any = await readJsonSafe(res);
    return j && typeof j === "object" ? j.existing ?? null : null;
  }

  async function checkLimits(voter: string, companyId?: string) {
    try {
      const sp = new URLSearchParams({ voter });
      if (companyId) sp.set("companyId", companyId);
      const r = await fetch(`/api/vote/limits?${sp.toString()}`, {
        cache: "no-store",
      });
      const j: any = await readJsonSafe(r);

      const daily = Number.isFinite(+j?.dailyRemaining)
        ? +j.dailyRemaining
        : Infinity;
      const companyMonthly = Number.isFinite(+j?.companyMonthlyRemaining)
        ? +j.companyMonthlyRemaining
        : Infinity;
      const companyAny =
        Number.isFinite(+j?.companyRemaining) && +j.companyRemaining >= 0
          ? +j.companyRemaining
          : companyMonthly;

      if (companyAny <= 0) {
        lockOut("company");
        return;
      }
      if (daily <= 0) {
        lockOut("daily");
        return;
      }
      setDailyLocked(false);
    } catch {
      setDailyLocked(false);
    }
  }

  /* ---------- stable handlers ---------- */

  const setVoter = useCallback(
    async (raw: string) => {
      setMsg("");
      setSelfCallout("");
      setSameCompanyCallout("");
      const code = extractStickerFromText(raw);
      if (!code) return;

      setVoterCode(code);
      const w = await apiLookup(code);

      if (!w) {
        setVoterName("");
        setVoterCompanyId("");
        setScanOpen(false);
        setMsg("We didn’t find your code. Redirecting to register…");
        setTimeout(() => router.push(`/k/${code}`), 300);
        return;
      }

      setVoterName(w.fullName ?? "");
      setVoterCompanyId(w.companyId ?? "");
      await checkLimits(code, w.companyId);

      setStep("target");
      setScanOpen(false);
    },
    [router]
  );

  const setTarget = useCallback(
    async (raw: string) => {
      setMsg("");
      const code = extractStickerFromText(raw);
      if (!code) return;

      if (code === voterCode) {
        showNoSelf();
        return;
      }
      if (getProjectFromCode(code) !== voterProject) {
        setMsg("Same-project only (NBK→NBK, JP→JP)");
        return;
      }

      const w = await apiLookup(code);
      if (!w) {
        setMsg(
          "We couldn't find that sticker. Ask your coworker to register first."
        );
        return;
      }

      if (w.companyId && w.companyId === voterCompanyId) {
        showNoSameCompany();
        return;
      }

      setSelfCallout("");
      setSameCompanyCallout("");
      setTargetCode(code);
      setTargetName(w.fullName ?? "");
      setScanOpen(false);
      setStep("confirm");
    },
    [voterProject, voterCode, voterCompanyId, showNoSelf, showNoSameCompany]
  );

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
    const json: any = await readJsonSafe(res);

    if (json?.ok) {
      const code = json.target?.code || targetCode;
      const name = (json.target?.fullName || targetName || "").trim();
      setMsg(json.message || `Vote for ${name || code} (${code}) recorded`);
      setStep("done");
      setScanOpen(false);

      // ---------- FEEDBACK GATE ----------
      try {
  const KEY_VOTES = "fb_votesGiven";
  const KEY_LAST  = "fb_lastFeedbackAt";

  const prevVotes = Number(localStorage.getItem(KEY_VOTES) || "0");
  const votes = prevVotes + 1; // increment for this vote
  const last  = Number(localStorage.getItem(KEY_LAST) || "0");
  const twentyDays = 20 * 24 * 60 * 60 * 1000;

  const serverSays = json?.promptFeedback === true; // only your API can force it
  const countOk = votes % 21 === 0 && votes > 0;     // 21, 42, 63, ...
  const timeOk  = last > 0 && (Date.now() - last) >= twentyDays;

  if (serverSays || countOk || timeOk) {
    // persist only when showing the modal
    localStorage.setItem(KEY_VOTES, String(votes));
    localStorage.setItem(KEY_LAST,  String(Date.now()));
    setShowFeedback(true);
  } else {
    // quietly persist the vote count but don't open the modal
    localStorage.setItem(KEY_VOTES, String(votes));
  }
} catch {}
      // -----------------------------------

      return;
    }

    const err = String(json?.error || "").toLowerCase();
    if (json?.code === "SAME_COMPANY" || (err.includes("same") && err.includes("company"))) {
      showNoSameCompany();
      setStep("target");
      setScanOpen(false);
      return;
    }
    if (json?.code === "DAILY_LIMIT" || (err.includes("daily") && err.includes("limit"))) {
      lockOut("daily");
      return;
    }
    if (json?.code === "COMPANY_MONTHLY_LIMIT" ||
        (err.includes("company") && (err.includes("monthly") || err.includes("limit")))) {
      lockOut("company");
      return;
    }
    if (err.includes("self")) {
      showNoSelf();
      setStep("target");
      setScanOpen(false);
      return;
    }

    setMsg(json?.error || "Error");
    setStep("target");
    setScanOpen(false);
  } catch (e: any) {
    setMsg(e?.message || "Network error");
    setStep("target");
    setScanOpen(false);
  }
}


  /* ---------- effects ---------- */

  // typing or changing the company means they're making a new choice
  useEffect(() => {
    setSelfCallout("");
    setSameCompanyCallout("");
    setMsg("");
  }, [query, filterCompanyId]);

  // Close camera when not on a scanning step
  useEffect(() => {
    if (step === "confirm" || step === "done") setScanOpen(false);
  }, [step]);

  // 🌟 NEW: boot flow — show loading while checking voterFromQS
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (voterFromQS) {
        setBootMsg("Finding your account…");
        setBooting(true);
        const w = await apiLookup(voterFromQS);
        if (!mounted) return;

        if (!w) {
          router.replace(`/k/${voterFromQS}`);
          return; // page will change; no need to clear boot
        }

        setVoterCode(voterFromQS);
        setVoterName(w.fullName ?? "");
        setVoterCompanyId(w.companyId ?? "");
        await checkLimits(voterFromQS, w.companyId);
        setStep("target");
        setBooting(false);
      } else {
        // No query param: brief grace so users still see a smooth boot
        setBootMsg("Loading…");
        setTimeout(() => mounted && setBooting(false), 250);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [voterFromQS, router]);

  // Load companies on target step (filter dropdown shows ALL companies from DB)
  useEffect(() => {
    if (step !== "target") return;
    (async () => {
      try {
        const res = await fetch("/api/register", { cache: "no-store" });
        const json: any = await readJsonSafe(res);
        setCompanies(Array.isArray(json?.companies) ? json.companies : []);
      } catch {}
    })();
  }, [step]);

  // Search workers (target step only) — with NBK/JP prefix guard
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

        const qTrim = q;
        if (qTrim) {
          params.set("q", qTrim);
        } else if (filterCompanyId && !qTrim) {
          params.set("q", "*");
        }

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
  }, [step, filterCompanyId, query, voterProject]);

  // AUTO-SCROLL when user types ≥3 chars or picks a company
  useEffect(() => {
    if (step !== "target") return;
    if (isSearching) return;
    if (!resultsRef.current) return;

    const hasFilter = !!filterCompanyId;
    const hasLongEnoughQuery = query.trim().length >= 3;

    if (!hasFilter && !hasLongEnoughQuery) return;
    if (!results || results.length === 0) return;

    const y =
      resultsRef.current.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [step, filterCompanyId, query, isSearching, results.length]);

  // Stable scan callbacks
  const onVoterScan = useCallback((t: string | null) => t && setVoter(t), [setVoter]);
  const onTargetScan = useCallback((t: string | null) => t && setTarget(t), [setTarget]);

  /* ---------- UI ---------- */

  // 🌟 NEW: full-screen boot loading
  if (booting) {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 h-10 w-10 rounded-full border-4 border-emerald-400/40 border-t-emerald-500 animate-spin" />
        <p className="text-sm text-gray-600">{bootMsg}</p>
      </main>
    );
  }

  if (dailyLocked) {
    return (
      <main className="p-4 max-w-md mx-auto space-y-4">
        <section className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-4 text-white text-center">
          <p className="text-base font-semibold">
            {lockMsg || "You’ve hit the limit for now. Please try again later."}
          </p>
        </section>
      </main>
    );
  }

  function setShowFeedback(arg0: boolean): void {
    throw new Error("Function not implemented.");
  }

  return (
    <main className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-center">Vote</h1>
      <div ref={topRef} />

      {/* Big callouts */}
      {selfCallout && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/60 bg-red-600/20 text-red-900 dark:text-red-100 p-4 text-center text-sm font-extrabold shadow-md"
        >
          {selfCallout}
          <div className="mt-1">
            <button
              className="text-xs underline"
              onClick={() => setSelfCallout("")}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {sameCompanyCallout && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/60 bg-red-600/20 text-red-900 dark:text-red-100 p-4 text-center text-sm font-extrabold shadow-md"
        >
          {sameCompanyCallout}
          <div className="mt-1">
            <button
              className="text-xs underline"
              onClick={() => setSameCompanyCallout("")}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ...the rest of your component stays the same... */}


      {/* STEP 1 — voter */}
      {step === "voter" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-3 text-white">
            <p className="text-sm">Enter your code to start.</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setVoter(voterCode);
            }}
            className="flex gap-2"
          >
            <input
              className="flex-1 border rounded p-2"
              placeholder="Your code (e.g., nbk1 / JP001)"
              value={voterCode}
              onChange={(e) => setVoterCode(e.target.value)}
              inputMode="search"
              autoCapitalize="characters"
              autoCorrect="off"
            />
            <button className="px-4 rounded bg-black text-white" type="submit">
              Next
            </button>
          </form>
        </section>
      )}

      {/* STEP 2 — target */}
      {step === "target" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-3 text-white isolate overflow-hidden">
            <p className="text-sm">
              Hello <b>{voterName || voterCode}</b>, who would you like to give a virtual token to?
            </p>

            {/* Token choice ONLY here, with extra spacing & dimming */}
            {isWalsh ? (
              <>
                <div className="mt-6 mb-4 flex flex-wrap items-center justify-center gap-6 max-w-xs mx-auto">
                  <TypeBadge
                    type="token"
                    size="md"
                    interactive
                    selected={voteType === "token"}
                    dimmed={voteType !== "token"}
                    onClick={() => setVoteType("token")}
                  />
                  <TypeBadge
                    type="goodCatch"
                    size="md"
                    interactive
                    selected={voteType === "goodCatch"}
                    dimmed={voteType !== "goodCatch"}
                    onClick={() => setVoteType("goodCatch")}
                  />
                </div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 text-center mt-1">
                  Choose a token type, then enter code or search coworker below.
                </p>
              </>
            ) : (
              <div className="mt-3 flex justify-center">
                <TypeBadge type="token" size="md" />
              </div>
            )}
          </div>

          {/* Search + Company filter */}
          <div className="rounded border p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Search by name or code — or — filter by company.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const raw = query.trim();
                const asCode = extractStickerFromText(raw);
                if (asCode) {
                  setTarget(asCode);
                  return;
                }
                if (results.length === 1) {
                  const w = results[0];
                  if (getProjectFromCode(w.code) !== voterProject) {
                    setMsg("Same-project only (NBK→NBK, JP→JP)");
                    return;
                  }
                  if (w.companyId === voterCompanyId) {
                    showNoSameCompany();
                    return;
                  }
                  if (w.code === voterCode) {
                    showNoSelf();
                    return;
                  }
                  setTargetCode(w.code);
                  setTargetName(w.fullName || "");
                  setSelfCallout("");
                  setSameCompanyCallout("");
                  setStep("confirm");
                }
              }}
              className="space-y-2"
            >
              <input
                className="w-full border rounded p-2"
                placeholder="Search name or code (Sam, nbk1, JP001)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                inputMode="search"
                autoCapitalize="characters"
                autoCorrect="off"
              />
              <select
                className="w-full border rounded p-2 bg-neutral-900 text-white"
                value={filterCompanyId}
                onChange={(e) => {
                  setFilterCompanyId(e.target.value);
                  (e.target as HTMLSelectElement).blur();
                }}
                title="Filter by company"
              >
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </form>

            {/* Results (auto-scroll target) */}
            <div ref={resultsRef}>
              {isSearching ? (
                <p className="text-sm text-gray-500">Searching…</p>
              ) : results.length ? (
                <ul className="divide-y border rounded">
                  {results.map((w) => (
                    <li key={w.code} className="flex items-center justify-between p-2">
                      <div>
                        <div className="font-medium">{w.fullName || "(no name yet)"}</div>
                        <div className="text-xs text-gray-600">{w.code}</div>
                      </div>
                      <button
                        className="px-3 py-1 rounded bg-black text-white"
                        onClick={() => {
                          if (getProjectFromCode(w.code) !== voterProject) {
                            setMsg("Same-project only (NBK→NBK, JP→JP)");
                            return;
                          }
                          if (w.companyId === voterCompanyId) {
                            showNoSameCompany();
                            return;
                          }
                          if (w.code === voterCode) {
                            showNoSelf();
                            return;
                          }
                          setTargetCode(w.code);
                          setTargetName(w.fullName || "");
                          setSelfCallout("");
                          setSameCompanyCallout("");
                          setStep("confirm");
                        }}
                      >
                        Select
                      </button>
                    </li>
                  ))}
                </ul>
              ) : filterCompanyId || query.trim() ? (
                <p className="text-sm text-gray-500">
                  {filterCompanyId && !query.trim()
                    ? "No employees registered yet for this company."
                    : "No matches found."}
                </p>
              ) : null}

              {/* Hint if user typed only NBK/JP */}
              {!isSearching && !filterCompanyId && isGenericCodePrefix(query) && (
                <p className="text-sm text-gray-500 mt-2">
                  Add a few digits after NBK/JP (e.g. NBK12) or type a name.
                </p>
              )}
            </div>
          </div>

          {msg && <p className="text-sm text-center">{msg}</p>}
        </section>
      )}

      {/* STEP 3 — confirm (no badges here) */}
      {step === "confirm" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-4 text-white">
            <p className="text-sm text-center">
              Confirm token is for <b>{targetName ? `${targetName} (${targetCode})` : targetCode}</b>?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 rounded border"
              onClick={() => {
                setStep("target");
              }}
            >
              Cancel
            </button>
            <button className="flex-1 py-2 rounded bg-black text-white" onClick={submitVote}>
              Confirm
            </button>
          </div>
        </section>
      )}

      {/* STEP 4 — done */}
      {step === "done" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-4 text-white text-center">
            <p>{msg}</p>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 rounded border"
              onClick={() => {
                setTargetCode("");
                setTargetName("");
                setQuery("");
                setFilterCompanyId("");
                setMsg("");
                setSelfCallout("");
                setSameCompanyCallout("");
                setStep("target");
              }}
            >
              Vote again
            </button>
          </div>
        </section>
      )}

      {/* Feedback modal (conditionally shown) */}
      {setShowFeedback && (
  <FeedbackModal
    onClose={() => setShowFeedback(false)}
    project={voterProject}
    voterCode={voterCode}
    voterCompanyId={voterCompanyId}
  />
)}
    </main>
  );
}
