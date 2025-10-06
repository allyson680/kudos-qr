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
const QrScanner = dynamic(() => import("@/Company/QRScanner"), { ssr: false });

type Step = "voter" | "target" | "confirm" | "done";
type LockKind = "daily" | "company";

/** Extract a sticker code from raw text OR a QR URL */
function extractStickerFromText(raw: string): string | null {
  if (!raw) return null;
  const t = raw.trim();

  // direct code (NBK1 / NBK-001 / JP010)
  const m = t.match(/\b(?:NBK|JP)-?\d{1,4}\b/i);
  if (m) return normalizeSticker(m[0]);

  // URL cases: /k/<code>, ?voter=<code>, ?code=<code>
  try {
    const u = new URL(t);
    const parts = u.pathname.split("/").filter(Boolean);
    const kIdx = parts.indexOf("k");
    if (kIdx !== -1 && parts[kIdx + 1])
      return normalizeSticker(parts[kIdx + 1]);

    const qp = u.searchParams.get("voter") || u.searchParams.get("code");
    if (qp) return normalizeSticker(qp);
  } catch {
    /* not a URL */
  }

  // fallback
  return normalizeSticker(t);
}

/** Ignore bare prefixes so "NBK" / "JP" (and dashed) don't explode the list */
function isGenericCodePrefix(str: string) {
  const t = (str || "").trim().toUpperCase();
  return t === "NBK" || t === "JP" || t === "NBK-" || t === "JP-";
}

function isSameCompanyError(j: any) {
  if (!j) return false;
  if (j.code === "SAME_COMPANY") return true;
  const err = (j.error || "").toLowerCase();
  return /\bsame[-\s]?company\b/.test(err);
}
function isDailyLimitError(j: any) {
  if (!j) return false;
  if (j.code === "DAILY_LIMIT") return true;
  const err = (j.error || "").toLowerCase();
  return err.includes("daily") && err.includes("limit");
}
function isCompanyMonthlyError(j: any) {
  if (!j) return false;
  if (j.code === "COMPANY_MONTHLY_LIMIT") return true;
  const err = (j.error || "").toLowerCase();
  return (
    (err.includes("company") &&
      (err.includes("monthly") || err.includes("limit"))) ||
    j.companyMonthlyRemaining === 0 ||
    j.companyRemaining === 0
  );
}

/** Safe JSON reader to avoid client crashes on HTML error pages */
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

export default function VotePageClient() {
  const qs = useSearchParams();
  const router = useRouter();

  const topRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // Big “no self voting” callout
  const [selfCallout, setSelfCallout] = useState<string>("");
  const [sameCompanyCallout, setSameCompanyCallout] = useState<string>("");
  const showNoSelf = useCallback(() => {
    setSelfCallout(
      "You cannot give a token to yourself! Please choose a wonderful deserving coworker instead."
    );
    try {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const showNoSameCompany = useCallback(() => {
    setSameCompanyCallout(
      "No same-company voting! Please choose a wonderful deserving coworker from a different company that's just as awesome as yours!"
    );
    try {
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const voterFromQS = normalizeSticker(qs.get("voter") || "");
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

  // scanner overlay control (keeps camera off until tapped on target step)
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
    const json = await readJsonSafe(res);
    if (json && typeof json === "object" && "existing" in json) {
      return (json as any).existing ?? null;
    }
    return null;
  }

  async function checkLimits(voter: string, companyId?: string) {
    try {
      const params = new URLSearchParams({ voter });
      if (companyId) params.set("companyId", companyId);
      const r = await fetch(`/api/vote/limits?${params.toString()}`, {
        cache: "no-store",
      });
      const j: any = await readJsonSafe(r);

      // Default to “unlocked” if we can't parse numbers
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

  // ---------- Stable handlers ----------
  const setVoter = useCallback(
    async (raw: string) => {
      setMsg("");
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
    [voterProject, voterCode, showNoSelf]
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
        // Post-write remaining checks
        const daily = Number.isFinite(+json.dailyRemaining)
          ? +json.dailyRemaining
          : Infinity;
        const companyMonthly = Number.isFinite(+json.companyMonthlyRemaining)
          ? +json.companyMonthlyRemaining
          : Infinity;
        const companyAny =
          Number.isFinite(+json.companyRemaining) && +json.companyRemaining >= 0
            ? +json.companyRemaining
            : companyMonthly;
      } else {
        if (isSameCompanyError(json)) {
          showNoSameCompany();
          setStep("target");
          setScanOpen(false);
          return;
        }
        if (isCompanyMonthlyError(json)) {
          lockOut("company");
          return;
        }
        if (isDailyLimitError(json)) {
          lockOut("daily");
          return;
        }

        const code = json.target?.code || targetCode;
        const name = (json.target?.fullName || targetName || "").trim();
        setMsg(json.message || `Vote for ${name || code} (${code}) recorded`);
        setStep("done");
        setScanOpen(false);
        return;
      }

      // Error path
      const err = String(json?.error || "").toLowerCase();

      if (err.includes("self")) {
        showNoSelf();
        setStep("target");
        setScanOpen(false);
        return;
      }
      if (err.includes("company")) {
        lockOut("company");
        return;
      }
      if (err.includes("daily")) {
        lockOut("daily");
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

  // ---------- Effects ----------
  // Close camera on non-scanning steps
  useEffect(() => {
    if (step === "confirm" || step === "done") setScanOpen(false);
  }, [step]);

  // Pre-check if landing with voter=? in URL
  useEffect(() => {
    if (voterFromQS) checkLimits(voterFromQS);
  }, [voterFromQS]);

  // If /vote?voter=... and not registered yet, send to /k/<code>
  useEffect(() => {
    if (!voterFromQS) return;
    (async () => {
      const w = await apiLookup(voterFromQS);
      if (!w) {
        router.replace(`/k/${voterFromQS}`);
        return;
      }
      setVoterCode(voterFromQS);
      setVoterName(w.fullName ?? "");
      setVoterCompanyId(w.companyId ?? "");
      setStep("target");
    })();
  }, [voterFromQS, router]);

  // Load companies on target step
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
    const qLen = q.length;
    const tooBroad = isGenericCodePrefix(q);

    // If no company filter and query is too short or just NBK/JP, don't fetch.
    if (!filterCompanyId && (qLen < 3 || tooBroad)) {
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
        const q = query.trim();
        if (q) {
          params.set("q", q);
        } else if (filterCompanyId === WALSH_COMPANY_ID) {
          // <— NEW: encourage the API to return WALSH even with empty query
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

  // AUTO-SCROLL to results (≥3 chars or filter chosen)
  useEffect(() => {
    if (step !== "target") return;
    if (isSearching) return;
    if (!resultsRef.current) return;

    const minChars = 3;
    const hasFilter = !!filterCompanyId;
    const hasLongEnoughQuery = query.trim().length >= minChars;

    if (!hasFilter && !hasLongEnoughQuery) return;
    if (!results || results.length === 0) return;

    const y =
      resultsRef.current.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [step, filterCompanyId, query, isSearching, results.length]);

  // Stable scan handlers
  const onVoterScan = useCallback(
    (t: string | null) => {
      if (t) setVoter(t);
    },
    [setVoter]
  );
  const onTargetScan = useCallback(
    (t: string | null) => {
      if (t) setTarget(t);
    },
    [setTarget]
  );

  // ---------- UI ----------
  if (dailyLocked) {
    return (
      <main className="p-4 max-w-md mx-auto space-y-4">
        <section className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-4 text-white text-center">
          <p className="text-base font-medium">
            {lockMsg || "You’ve hit the limit for now. Please try again later."}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-center">Vote</h1>
      <div ref={topRef} />

      {selfCallout && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-700/40 text-red-50 p-4 text-center text-sm font-semibold shadow-md animate-pulse"
        >
          {selfCallout}
          <div className="mt-1">
            <button
              className="text-xs underline text-red-100/90"
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
          className="rounded-lg border border-red-500/40 bg-red-700/30 text-red-100 p-3 flex items-start justify-between"
        >
          <div className="pr-3">
            <div className="font-semibold">No same-company voting!</div>
            <div className="text-sm opacity-90">{sameCompanyCallout}</div>
          </div>
          <button
            className="text-xs underline text-red-100/90"
            onClick={() => setSameCompanyCallout("")}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* STEP 1 — voter */}
      {step === "voter" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-3 text-white">
            <p className="text-sm">
              Scan your QR sticker or enter your code below.
            </p>
          </div>

          <div className="rounded border overflow-hidden">
            <div className="aspect-[4/3]">
              <QrScanner
                onScan={onVoterScan}
                onError={(e) => setMsg(e.message)}
              />
            </div>
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
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-3 text-white">
            <p className="text-sm">
              Hello <b>{voterName || voterCode}</b>, who would you like to give
              a virtual token to?
            </p>

            {/* Token choice ONLY here */}
            {isWalsh ? (
              <>
                <div className="mt-3 flex items-center justify-center gap-6">
                  <div
                    className={
                      voteType === "token"
                        ? "scale-110 transition-transform"
                        : ""
                    }
                  >
                    <TypeBadge
                      type="token"
                      size="lg"
                      interactive
                      selected={voteType === "token"}
                      onClick={() => setVoteType("token")}
                    />
                  </div>
                  <div
                    className={
                      voteType === "goodCatch"
                        ? "scale-110 transition-transform"
                        : ""
                    }
                  >
                    <TypeBadge
                      type="goodCatch"
                      size="lg"
                      interactive
                      selected={voteType === "goodCatch"}
                      onClick={() => setVoteType("goodCatch")}
                    />
                  </div>
                </div>
                <p className="text-xs text-center text-gray-300 mt-2">
                  Tap a token above, then scan or search your coworker.
                </p>
              </>
            ) : (
              <div className="mt-3 flex justify-center">
                <div className="scale-110">
                  <TypeBadge type="token" size="lg" />
                </div>
              </div>
            )}
          </div>

          {/* Tap to scan area */}
          <div className="rounded border overflow-hidden">
            <div className="aspect-[4/3] relative">
              {!scanOpen && (
                <button
                  type="button"
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-white text-sm"
                  onClick={() => setScanOpen(true)}
                >
                  Tap to scan
                </button>
              )}
              {scanOpen && (
                <QrScanner
                  key={`scanner-${step}-${scanOpen}`}
                  onScan={onTargetScan}
                  onError={(e) => {
                    setMsg(e.message);
                    setScanOpen(false);
                  }}
                />
              )}
            </div>
          </div>

          {/* Search + Company filter */}
          <div className="rounded border p-3 space-y-2">
            <p className="text-xs text-gray-300">
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
                  if (w.code === voterCode) {
                    showNoSelf();
                    return;
                  }
                  setTargetCode(w.code);
                  setTargetName(w.fullName || "");
                  setSelfCallout("");
                  setScanOpen(false);
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
                onChange={(e) => setFilterCompanyId(e.target.value)}
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
                          if (getProjectFromCode(w.code) !== voterProject) {
                            setMsg("Same-project only (NBK→NBK, JP→JP)");
                            return;
                          }
                          // ⬇️ NEW: block same-company picks right away
                          if (w.companyId && w.companyId === voterCompanyId) {
                            showNoSameCompany();
                            return;
                          }
                          if (w.code === voterCode) {
                            showNoSelf();
                            return;
                          }
                          setSelfCallout("");
                          setSameCompanyCallout("");
                          setTargetCode(w.code);
                          setTargetName(w.fullName || "");
                          setSelfCallout("");
                          setScanOpen(false);
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
              ) : null}

              {/* Hint if user typed only NBK/JP */}
              {!isSearching &&
                !filterCompanyId &&
                isGenericCodePrefix(query) && (
                  <p className="text-sm text-gray-500 mt-2">
                    Codes must start with either NBK or JP and followed by
                    numbers.
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
                setScanOpen(false);
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
                setFilterCompanyId(""); // reset to All companies
                setStep("target");
                setScanOpen(false);
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
