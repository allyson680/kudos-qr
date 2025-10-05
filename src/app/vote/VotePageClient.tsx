"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
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

export default function VotePageClient() {
  const qs = useSearchParams();
  const router = useRouter();

  // ⬇️ used for auto-scroll to results
  const resultsRef = useRef<HTMLDivElement | null>(null);

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

  // type (Walsh only)
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

  // scanner overlay control (keeps camera off until tapped)
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
    const json = await res.json();
    return json?.existing ?? null;
  }

  async function checkLimits(voter: string, companyId?: string) {
    try {
      const params = new URLSearchParams({ voter });
      if (companyId) params.set("companyId", companyId);
      const r = await fetch(`/api/vote/limits?${params.toString()}`, {
        cache: "no-store",
      });
      const j = await r.json();
      if (j?.ok) {
        if (typeof j.companyRemaining === "number" && j.companyRemaining <= 0) {
          lockOut("company");
          return;
        }
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

  /** Stable voter setter (prevents scanner reinit thrash) */
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
        // send them to the registration page for their sticker
        setTimeout(() => router.push(`/k/${code}`), 300);
        return;
      }

      setVoterName(w.fullName ?? "");
      setVoterCompanyId(w.companyId ?? "");
      await checkLimits(code);

      setStep("target");
      setScanOpen(false); // keep overlay until they tap to scan
    },
    [router]
  );

  /** Stable target setter */
  const setTarget = useCallback(
    async (raw: string) => {
      setMsg("");
      const code = extractStickerFromText(raw);
      if (!code) return;

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

      setTargetCode(code);
      setTargetName(w.fullName ?? "");
      setScanOpen(false);
      setStep("confirm");
    },
    [voterProject]
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
      const json = await res.json();

      if (json.ok) {
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
        setMsg(json.message || `Vote for ${name || code} (${code}) recorded`);
        setStep("done");
        setScanOpen(false);
      } else {
        const err = (json.error || "").toLowerCase();
        if (err.includes("company")) {
          lockOut("company");
          return;
        }
        if (err.includes("daily")) {
          lockOut("daily");
          return;
        }
        setMsg(json.error || "Error");
        setStep("target");
        setScanOpen(false);
      }
    } catch (e: any) {
      setMsg(e?.message || "Network error");
      setStep("target");
      setScanOpen(false);
    }
  }

  // Close camera on non-scanning steps
  useEffect(() => {
    if (step === "confirm" || step === "done") setScanOpen(false);
  }, [step]);

  // Pre-check if landing with voter=? in URL
  useEffect(() => {
    if (voterFromQS) checkLimits(voterFromQS);
  }, [voterFromQS]);

  // Load companies once you're on target step
  useEffect(() => {
    if (step !== "target") return;
    (async () => {
      try {
        const res = await fetch("/api/register", { cache: "no-store" });
        const json = await res.json();
        setCompanies(Array.isArray(json.companies) ? json.companies : []);
      } catch {}
    })();
  }, [step]);

  useEffect(() => {
    if (!voterFromQS) return;
    (async () => {
      const w = await apiLookup(voterFromQS);
      if (!w) {
        // if someone opens /vote?voter=NBK1 and NBK1 isn't registered, send them to /k/NBK0001
        router.replace(`/k/${voterFromQS}`);
        return;
      }
      setVoterCode(voterFromQS);
      setVoterName(w.fullName ?? "");
      setVoterCompanyId(w.companyId ?? "");
      setStep("target");
    })();
  }, [voterFromQS, router]);

  // Search workers (target step only)
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
  }, [step, filterCompanyId, query, voterProject]);

  // ⬇️ AUTO-SCROLL EFFECT — scroll to results after filtering/searching
  useEffect(() => {
    if (step !== "target") return;
    if (isSearching) return; // wait until fetch finishes
    if (!resultsRef.current) return;

    const minChars = 3;
    const hasFilter = !!filterCompanyId;
    const hasLongEnoughQuery = query.trim().length >= minChars;

    // Only scroll if a filter is chosen OR the query is at least 3 chars
    if (!hasFilter && !hasLongEnoughQuery) return;

    // Also don’t scroll if nothing came back
    if (!results || results.length === 0) return;

    const y =
      resultsRef.current.getBoundingClientRect().top + window.scrollY - 12;

    window.scrollTo({ top: y, behavior: "smooth" });

    // Hide the mobile keyboard after filtering/searching
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, [step, filterCompanyId, query, isSearching, results.length]);

  // Submit handler for target search
  const handleSearchSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const raw = query.trim();

      const asCode = extractStickerFromText(raw);
      if (asCode) {
        await setTarget(asCode);
        return;
      }

      if (results.length === 1) {
        const w = results[0];
        if (getProjectFromCode(w.code) !== voterProject) {
          setMsg("Same-project only (NBK→NBK, JP→JP)");
          return;
        }
        setTargetCode(w.code);
        setTargetName(w.fullName || "");
        setScanOpen(false);
        setStep("confirm");
      }
    },
    [query, results, setTarget, voterProject]
  );

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

  // Stable scan handlers (don’t inline to avoid reinit)
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

  return (
    <main className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-center">Vote</h1>

      {/* STEP 1 — voter */}
      {step === "voter" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-3 text-white">
            <p className="text-sm">Scan your QR code, or enter code below.</p>
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
              <div className="mt-3 flex justify-center">
                <TypeBadge type="token" size="lg" />
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
                  key={`scanner-${step}-${scanOpen}`} // force clean remount
                  onScan={onTargetScan}
                  onError={(e) => {
                    setMsg(e.message);
                    setScanOpen(false);
                  }}
                />
              )}
            </div>
          </div>

          {/* Combined Search + Company filter */}
          <div className="rounded border p-3 space-y-2">
            {/* ⬅️ Instruction moved to top */}
            <p className="text-xs text-gray-300">
              Search by name or code - or filter by company.
            </p>

            <form onSubmit={handleSearchSubmit} className="space-y-2">
              <input
                className="w-full border rounded p-2"
                placeholder="Search name or code (Sam, nbk1 / JP001)"
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

            {/* Results (kept under a ref for auto-scroll) */}
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
                          setTargetCode(w.code);
                          setTargetName(w.fullName || "");
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
            </div>
          </div>

          {msg && <p className="text-sm text-center">{msg}</p>}
        </section>
      )}

      {/* STEP 3 — confirm */}
      {step === "confirm" && (
        <section className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-neutral-900/80 backdrop-blur p-4 text-white">
            <p className="text-sm text-center">
              Confirm token is for{" "}
              <b>{targetName ? `${targetName} (${targetCode})` : targetCode}</b>
              ?
            </p>
            <div className="mt-3 flex justify-center">
              <TypeBadge type={voteType} />
            </div>
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
