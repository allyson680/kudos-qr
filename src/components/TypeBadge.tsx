"use client";
import React from "react";

type Props = {
  type: "token" | "goodCatch";
  size?: "md" | "lg";
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
};

export default function TypeBadge({
  type,
  size = "lg",
  interactive = false,
  selected = false,
  onClick,
}: Props) {
  const isToken = type === "token";

  const dims =
    size === "lg"
      ? "w-32 h-32 md:w-36 md:h-36"
      : "w-24 h-24";

  // Keep your colors
  const bg = isToken
    ? "bg-gradient-to-b from-green-500 to-green-700 text-white"
    : "bg-gradient-to-b from-amber-300 to-yellow-500 text-emerald-800";

  const ring  = selected ? "ring-4 ring-black/25" : "ring-2 ring-black/10";
  const hover = interactive ? "cursor-pointer transition-transform hover:scale-[1.03]" : "";
  const bump  = selected ? "scale-[1.12] md:scale-[1.18]" : "";

  // Desync shimmer phase (stable per mount)
  const [delay] = React.useState(() => {
    // random between -2.0s and 0s so animation starts mid-sweep
    return `${-(Math.random() * 2).toFixed(2)}s`;
  });

  // Faster & brighter when selected
  const duration = selected ? "1.5s" : "2.2s";
  const peak     = selected ? 0.5 : 0.35;

  const style = {
    // CSS vars consumed by .token-shimmer in globals
    ["--shimmer-delay" as any]: delay,
    ["--shimmer-duration" as any]: duration,
    ["--shimmer-peak" as any]: peak,
  } as React.CSSProperties;

  return (
    <button
      type="button"
      aria-label={isToken ? "Token of Excellence" : "Good Catch"}
      onClick={interactive ? onClick : undefined}
      style={style}
      className={`relative ${dims} flex items-center justify-center rounded-full
                  font-extrabold text-center shadow-lg select-none token-shimmer
                  ${bg} ${ring} ${hover} ${bump}`}
    >
      <span
        className={`leading-tight text-xs md:text-sm tracking-wide ${
          isToken ? "text-white" : "text-emerald-800"
        }`}
      >
        {isToken ? (
          <>
            TOKEN
            <br />
            OF
            <br />
            EXCELLENCE
          </>
        ) : (
          <>
            GOOD
            <br />
            CATCH
          </>
        )}
      </span>

      {/* subtle inner ring */}
      <div className="pointer-events-none absolute inset-[6%] rounded-full ring-2 ring-white/48" />
      {/* soft outer glow */}
      <div
        className={`pointer-events-none absolute -inset-1 rounded-full blur-md opacity-30 ${
          isToken ? "bg-green-500" : "bg-amber-400"
        }`}
      />
    </button>
  );
}
