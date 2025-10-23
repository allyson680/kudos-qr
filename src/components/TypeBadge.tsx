// components/TypeBadge.tsx
"use client";
import React from "react";

type Props = {
  type: "token" | "goodCatch";
  size?: "md" | "lg";
  interactive?: boolean;
  selected?: boolean;
  dimmed?: boolean; // lets the parent dim the unselected coin
  onClick?: () => void;
};

export default function TypeBadge({
  type,
  size = "lg",
  interactive = false,
  selected = false,
  dimmed = false,
  onClick,
}: Props) {
  const isToken = type === "token";

  // Physical footprint stays constant; we only scale with transform.
  const dims = size === "lg" ? "w-32 h-32 md:w-36 md:h-36" : "w-24 h-24";

  // Colors
  const bg = isToken
    ? "bg-gradient-to-b from-green-500 to-green-700 text-white"
    : "bg-gradient-to-b from-amber-300 to-yellow-500 text-emerald-800";

  // Keep ring thickness the same (no layout/visual size jump from ring)
  const ring = selected ? "ring-4 ring-white/60" : "ring-4 ring-white/25";

  // Selected vs unselected size via transform only
  // (This guarantees “on load” = “when selected” size.)
  const scale = selected ? "scale-[1.10]" : "scale-[0.95]";

  // Keep it interactive without affecting size
  const hover = interactive ? "cursor-pointer hover:brightness-110" : "";

  // Optional dim for unselected when another is picked
  const dim = dimmed && !selected ? "opacity-55 brightness-95" : "";

  // Subtle glow that does NOT use inset sizing (pure blur)
  const glowOpacity = selected ? "opacity-35" : "opacity-18";

  return (
    <button
      type="button"
      aria-label={isToken ? "Token of Excellence" : "Good Catch"}
      onClick={interactive ? onClick : undefined}
      className={[
        "relative", dims,
        "flex items-center justify-center rounded-full font-extrabold text-center select-none",
        "shadow-lg token-shimmer",
        bg,
        ring,
        scale,
        hover,
        dim,
        "transition-[transform,opacity,filter,box-shadow] duration-200 ease-out will-change-transform",
      ].join(" ")}
    >
      <span className={`leading-tight text-xs md:text-sm tracking-wide ${isToken ? "text-white" : "text-emerald-800"}`}>
        {isToken ? (
          <>
            TOKEN<br />OF<br />EXCELLENCE
          </>
        ) : (
          <>
            GOOD<br />CATCH
          </>
        )}
      </span>

      {/* Subtle inner ring (pure ring, no inset that changes visual size) */}
      <div className="pointer-events-none absolute inset-[6%] rounded-full ring-2 ring-white/45" />

      {/* Soft outer bloom (pure blur, no inset offset) */}
      <div
        className={[
          "pointer-events-none absolute inset-0 rounded-full blur-md",
          glowOpacity,
          isToken ? "bg-green-500" : "bg-amber-400",
        ].join(" ")}
      />
    </button>
  );
}
