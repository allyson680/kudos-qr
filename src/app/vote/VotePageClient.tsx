"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { normalizeStickerStrict, getProjectFromCode } from "@/lib/codeUtils";
import TypeBadge from "@/components/TypeBadge";
import {
  getNextOutOfTokensMessage,
  getNextCompanyCapMessage,
} from "@/lib/outOfTokens";

type Worker = { code: string; fullName: string; companyId: string };
type Company = { id: string; name?: string };

const WALSH_COMPANY_ID = "WALSH";

type Step = "voter" | "target" | "confirm" | "done";
type LockKind = "daily" | "company";

/* ---------- helpers ---------- */

// Pull code from raw text or URL
function extractStickerFromText(raw: string): string | null {
  if (!raw) return null;
  const t = raw.trim();

  const m = t.match(/\b(?:NBK|JP)-?\d{1,4}\b/i);
  if (m) return normalizeStickerStrict(m[0]);

  try {
    const u = new URL(t);
    const parts = u.pathname.split("/").filter(Boolean);
    const kIdx = parts.indexOf("k");
    if (kIdx !== -1 && parts[kIdx + 1])
      return normalizeStickerStrict(parts[kIdx + 1]);
    const qp = u.searchParams.get("voter") || u.searchParams.get("code");
    if (qp) return normalizeStickerStrict(qp);
  } catch {
    /* not a URL */
  }

  return normalizeStickerStrict(t);
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

export default function VotePageClient() {
  const qs = useSearchParams();
  const router = useRouter();

  const topRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // 🌟 NEW: boot/loading state for first paint
  const [booting, setBooting] = useState(true);
  const [bootMsg, setBootMsg] = useState("Loading…");
  const [finding, setFinding] = useState(false);

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

  const voterFromQS = normalizeStickerStrict(qs.get("voter") || "") || "";
  const typeFromQS = (
    qs.get("type") === "goodCatch" ? "goodCatch" : "token"
  ) as "token" | "goodCatch";

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

  // quick numeric code entry for target
  const [targetDigits, setTargetDigits] = useState("");
  useEffect(() => {
    if (step === "target") setTargetDigits("");
  }, [step]);

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

  // messages
  const [msg, setMsg] = useState("");

  // keypad input ref
  const numInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (step === "voter") numInputRef.current?.focus();
  }, [step]);

  // lock state
  const [dailyLocked, setDailyLocked] = useState(false);
  const [lockMsg, setLockMsg] = useState("");
  // token-only lock (Walsh can still send Good Catch)
  const [tokenLocked, setTokenLocked] = useState(false);

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

      const tokensCapped = companyAny <= 0 || daily <= 0;

      // Walsh: only lock Tokens, allow Good Catch
      if (companyId === WALSH_COMPANY_ID) {
        setTokenLocked(tokensCapped);
        if (tokensCapped) {
          setLockMsg(
            "Tokens are capped for today, but you can still send a Good Catch."
          );
          setVoteType("goodCatch");
        }
        setDailyLocked(false);
        return;
      }

      // Non-Walsh: full lock when capped
      if (tokensCapped) {
        lockOut(companyAny <= 0 ? "company" : "daily");
        return;
      }
      setDailyLocked(false);
      setTokenLocked(false);
    } catch {
      // fail-open: don't lock the whole app
      setDailyLocked(false);
      setTokenLocked(false);
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

      setFinding(true);
      try {
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
        await checkLimits(code, w.companyId);
        setStep("target");
      } finally {
        setFinding(false);
      }
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
      setStep("confirm");
    },
    [voterProject, voterCode, voterCompanyId, showNoSelf, showNoSameCompany]
  );

  async function submitVote() {
    setMsg("");
    if (isWalsh && tokenLocked && voteType === "token") {
      setMsg("Token limit reached today — choose Good Catch instead.");
      return;
    }

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

        // ---------- FEEDBACK GATE ----------
        try {
          const KEY_VOTES = "fb_votesGiven";
          const KEY_LAST = "fb_lastFeedbackAt";

          const prevVotes = Number(localStorage.getItem(KEY_VOTES) || "0");
          const votes = prevVotes + 1;
          const last = Number(localStorage.getItem(KEY_LAST) || "0");
          const twentyDays = 20 * 24 * 60 * 60 * 1000;

          const serverSays = json?.promptFeedback === true;
          const countOk = votes % 21 === 0 && votes > 0;
          const timeOk = last > 0 && Date.now() - last >= twentyDays;

          if (serverSays || countOk || timeOk) {
            localStorage.setItem(KEY_VOTES, String(votes));
            localStorage.setItem(KEY_LAST, String(Date.now()));
          } else {
            localStorage.setItem(KEY_VOTES, String(votes));
          }
        } catch {}

        return;
      }

      const err = String(json?.error || "").toLowerCase();
      if (
        json?.code === "SAME_COMPANY" ||
        (err.includes("same") && err.includes("company"))
      ) {
        showNoSameCompany();
        setStep("target");
        return;
      }
      if (
        json?.code === "DAILY_LIMIT" ||
        (err.includes("daily") && err.includes("limit"))
      ) {
        lockOut("daily");
        return;
      }
      if (
        json?.code === "COMPANY_MONTHLY_LIMIT" ||
        (err.includes("company") &&
          (err.includes("monthly") || err.includes("limit")))
      ) {
        lockOut("company");
        return;
      }
      if (err.includes("self")) {
        showNoSelf();
        setStep("target");
        return;
      }

      setMsg(json?.error || "Error");
      setStep("target");
    } catch (e: any) {
      setMsg(e?.message || "Network error");
      setStep("target");
    }
  }

  /* ---------- effects ---------- */

  // typing or changing the company means they're making a new choice
  useEffect(() => {
    setSelfCallout("");
    setSameCompanyCallout("");
    setMsg("");
  }, [query, filterCompanyId]);

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
          return; // page will change
        }

        setVoterCode(voterFromQS);
        setVoterName(w.fullName ?? "");
        setVoterCompanyId(w.companyId ?? "");
        await checkLimits(voterFromQS, w.companyId);
        setStep("target");
        setBooting(false);
      } else {
        setBootMsg("Loading…");
        setTimeout(() => mounted && setBooting(false), 250);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [voterFromQS, router]);

  // Load companies for the filter dropdown when entering the target step
  useEffect(() => {
    if (step !== "target") return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/companies", { cache: "no-store" });
        const json: any = await readJsonSafe(res);
        const raw = Array.isArray(json?.companies) ? json.companies : [];

        const normalized: Company[] = raw
          .map((c: any) => {
            if (typeof c === "string") return { id: c, name: c };
            const id = c.id ?? c.companyId ?? c.slug ?? c.code ?? "";
            const name = c.name ?? c.displayName ?? c.title ?? id ?? "";
            return id ? { id, name } : null;
          })
          .filter(Boolean);

        if (!cancelled) setCompanies(normalized);
      } catch (err) {
        console.error("Failed to load companies", err);
        if (!cancelled) setCompanies([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step]);

  // Live search — works with query OR just a company filter
  useEffect(() => {
    if (step !== "target") return;

    const q = (query || "").trim();
    const tooBroad = isGenericCodePrefix(q);

    if (!q && !filterCompanyId) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    if (q && tooBroad) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (filterCompanyId) params.set("companyId", filterCompanyId);
        if (q) params.set("q", q); // if no q, list-by-company
        params.set("limit", "50");

        const r = await fetch(`/api/admin/workers?${params.toString()}`, {
          cache: "no-store",
        });
        const j: any = await readJsonSafe(r);
        if (!cancelled) {
          setResults(Array.isArray(j?.workers) ? j.workers : []);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [step, filterCompanyId, query]);

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

  function filterCompanyOrQueryMessage() {
    return filterCompanyId && !query.trim()
      ? "No workers found for that company yet."
      : "No matches found.";
  }

  return (
    <main className="p-4 max-w-md mx-auto space-y-4">
      <div ref={topRef} />

      {finding && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
          <div className="rounded-xl bg-white px-6 py-5 text-center shadow-lg">
            <p className="flex items-center justify-center gap-2 text-base font-semibold text-gray-900">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-green-500"></span>
              Finding your account…
            </p>
          </div>
        </div>
      )}

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
      {/* STEP 1 — voter */}
      {step === "voter" && (
        <section className="space-y-4 text-gray-900 dark:text-gray-100">
          <div className="p-3">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Select your project, then tap to enter your number.
            </p>
          </div>

          {/* NBK / JP selection buttons */}
          <div className="flex justify-center gap-4">
            {(["NBK", "JP"] as const).map((proj) => (
              <button
                key={proj}
                type="button"
                onClick={() => {
                  const digits = voterCode
                    .replace(/^(NBK|JP)-?/i, "")
                    .replace(/\D/g, "")
                    .slice(0, 4);
                  setVoterCode(proj + digits.padStart(4, "0"));
                  numInputRef.current?.focus();
                }}
                className={`px-5 py-2 rounded font-bold border transition-colors ${
                  voterCode.startsWith(proj)
                    ? "bg-emerald-600 border-emerald-400 text-white"
                    : "bg-neutral-800 border-neutral-600 text-gray-200 hover:bg-neutral-700"
                }`}
                aria-pressed={voterCode.startsWith(proj)}
              >
                {proj}
              </button>
            ))}
          </div>

          {/* Hidden input + button that shows live code */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setVoter(voterCode);
            }}
            className="space-y-4"
          >
            {/* hidden input to trigger native number pad */}
            <input
              ref={numInputRef}
              type="tel"
              inputMode="numeric"
              className="sr-only"
              value={voterCode.replace(/^(NBK|JP)-?/i, "").replace(/^0+/, "")}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                const prefix = voterCode.startsWith("JP") ? "JP" : "NBK";
                setVoterCode(prefix + digits.padStart(4, "0"));
              }}
              aria-label="Enter your number"
            />

            {/* tap-to-enter button that stays visible and shows live code */}
            <button
              type="button"
              onClick={() => numInputRef.current?.focus()}
              className="w-full py-4 rounded-lg border border-emerald-500 text-emerald-200 bg-neutral-900 text-lg font-semibold hover:bg-neutral-800"
              aria-live="polite"
            >
              {(() => {
                const digits = voterCode.replace(/^(NBK|JP)-?/i, "");
                const prefix = voterCode.startsWith("JP") ? "JP" : "NBK";
                return digits
                  ? `Code: ${prefix}${digits.padStart(4, "0")} — tap to edit`
                  : "Tap to enter your number";
              })()}
            </button>

            <button
              type="submit"
              className="w-full py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              Continue
            </button>
          </form>
        </section>
      )}

      {/* STEP 2 — target */}
      {step === "target" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-3 text-white isolate overflow-hidden">
            <p className="text-sm">
              Hello <b>{voterName || voterCode}</b>, who would you like to give
              a virtual token to?
            </p>

            {/* Token choice ONLY here, with extra spacing & dimming */}
            {isWalsh ? (
              <>
                {isWalsh && tokenLocked && (
                  <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 p-2 text-center text-sm">
                    Tokens are capped today, but you can still send a{" "}
                    <b>Good Catch</b>.
                  </div>
                )}
                <div className="mt-6 mb-4 flex flex-wrap items-center justify-center gap-6 max-w-xs mx-auto">
                  <TypeBadge
                    type="token"
                    size="md"
                    interactive={!tokenLocked}
                    selected={voteType === "token"}
                    dimmed={voteType !== "token" || tokenLocked}
                    onClick={() => {
                      if (tokenLocked) return;
                      setVoteType("token");
                    }}
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
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-center mt-1">
                  Choose a token type, then enter your coworker’s code or search
                  by name.
                </p>
              </>
            ) : (
              <div className="mt-3 flex justify-center">
                <TypeBadge type="token" size="md" />
              </div>
            )}
          </div>

          {/* NBK / JP project buttons (match voter project) */}
          <div className="flex justify-center gap-4 mt-3">
            {(["NBK", "JP"] as const).map((proj) => (
              <button
                key={proj}
                type="button"
                onClick={() => {
                  if (proj !== voterProject) {
                    alert("Coworker must be assigned to the same project!");
                    return;
                  }
                  setFilterCompanyId(""); // optional: reset any filters
                }}
                className={`px-5 py-2 rounded font-bold border transition-colors ${
                  proj === voterProject
                    ? "bg-emerald-600 border-emerald-400 text-white"
                    : "bg-neutral-800 border-neutral-600 text-gray-400 opacity-60 cursor-not-allowed"
                }`}
                disabled={proj !== voterProject}
              >
                {proj}
              </button>
            ))}
          </div>
          {/* quick numeric target code entry (digits only, mobile keypad) */}
          <div className="border border-emerald-600 rounded-lg p-3 bg-neutral-900/60">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const digits = targetDigits.replace(/\D/g, "").slice(0, 4);
                if (!digits) return;
                const full = voterProject + digits.padStart(4, "0");
                setTarget(full);
              }}
              className="space-y-3"
            >
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 text-center">
                    Enter coworker number or search for them below.
                  </p>

                  <input
                    type="tel"
                    className="w-full border border-emerald-400 rounded p-3 text-black text-center text-lg bg-white"
                    placeholder={`e.g., 23 → ${voterProject}0023`}
                    value={targetDigits}
                    onChange={(e) =>
                      setTargetDigits(
                        e.target.value.replace(/\D/g, "").slice(0, 4)
                      )
                    }
                    inputMode="numeric"
                    aria-label="Coworker number"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  disabled={!targetDigits}
                >
                  Use Code
                </button>
              </div>

              <div className="text-center text-xs text-gray-400">
                {targetDigits
                  ? `Will use ${voterProject}${targetDigits.padStart(4, "0")}`
                  : `Waiting for digits…`}
              </div>
            </form>
          </div>

          {/* Search + Company filter (unchanged) */}
          <div className="rounded border p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Search by name or filter by company.
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
                placeholder={`Search by name`}
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
                {companies.length === 0 ? (
                  <option disabled>(No companies loaded)</option>
                ) : (
                  companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? c.id}
                    </option>
                  ))
                )}
              </select>
            </form>
          </div>

          {/* Results (auto-scroll target) */}
          <div ref={resultsRef}>
            {isSearching ? (
              <p className="text-sm text-gray-500">Searching…</p>
            ) : results.length > 0 ? (
              <ul className="divide-y border rounded">
                {results.map((w) => (
                  <li
                    key={w.code}
                    className="flex items-center justify-between p-2"
                  >
                    <div>
                      <div className="font-medium">
                        {w.fullName || w.fullName || "(no name yet)"}
                      </div>
                      <div className="text-xs texSt-gray-600">{w.code}</div>
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
                        setTargetName(w.fullName || w.fullName || "");
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
            ) : !query.trim() ? (
              <p className="text-sm text-gray-500">
                Start typing a name or code to see results…
              </p>
            ) : isGenericCodePrefix(query) && !filterCompanyId ? (
              <p className="text-sm text-gray-500 mt-2">
                Add a few digits after NBK/JP (e.g. NBK12) or type a name.
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                {filterCompanyOrQueryMessage()}
              </p>
            )}
          </div>
        </section>
      )}

      {/* STEP 3 — confirm (no badges here) */}
      {step === "confirm" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-4 text-white">
            <p className="text-sm text-center">
              Confirm token is for{" "}
              <b>{targetName ? `${targetName} (${targetCode})` : targetCode}</b>
              ?
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
    </main>
  );
}
