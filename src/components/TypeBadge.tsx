"use client";

import React from "react";

type TokenType = "token" | "goodCatch";
type Size = "sm" | "md" | "lg";

export default function TypeBadge({
  type,
  size = "md",
  interactive = false,
  selected = false,
  onClick,
}: {
  type: TokenType;
  size?: Size;
  interactive?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const sizeClasses =
    size === "lg"
      ? "w-20 h-20 text-base"      // 80px
      : size === "sm"
      ? "w-10 h-10 text-[11px]"    // 40px
      : "w-14 h-14 text-sm";       // 56px (default md)

  const base =
    "relative rounded-full flex items-center justify-center font-semibold select-none";

  // Distinct looks for the two badge types
  const fill =
    type === "token"
      ? // “gold coin” look
        "bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 " +
        "shadow-lg shadow-amber-500/30 border border-amber-300/60"
      : // “good catch” look
        "bg-gradient-to-br from-emerald-300 via-cyan-400 to-sky-500 " +
        "shadow-lg shadow-cyan-500/30 border border-cyan-300/60";

  // Selection ring + scale “pop”
  const selectedRing =
    type === "token"
      ? "ring-4 ring-yellow-400/60"
      : "ring-4 ring-cyan-300/60";

  const behavior = [
    "transition-transform duration-200 ease-out",
    selected ? "scale-125" : "scale-100", // <— bigger when selected
    interactive ? "cursor-pointer active:scale-95 focus:outline-none" : "",
  ].join(" ");

  // Optional label text
  const label = type === "token" ? "Token" : "Good Catch";

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={[
        base,
        sizeClasses,
        fill,
        behavior,
        selected ? selectedRing : "ring-0",
        // Shimmer overlay (defined in globals.css); only on token
        type === "token" ? "token-shimmer" : "",
      ].join(" ")}
    >
      {/* Inner bevel to sell the coin look a bit more */}
      <span
        className={[
          "absolute inset-0 rounded-full pointer-events-none",
          "bg-white/0",
          "shadow-inner shadow-black/10",
        ].join(" ")}
      />
      <span className="relative z-10 tracking-wide drop-shadow-sm">
        {label}
      </span>
    </button>
  );
}
