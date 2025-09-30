"use client";

type Props = { type: "token" | "goodCatch"; className?: string };

export default function TypeBadge({ type, className = "" }: Props) {
  const isGoodCatch = type === "goodCatch";

  // Mobile-first sizes; grows a bit on >= sm
  const base =
    "coin inline-flex items-center justify-center " +
    "w-20 h-20 sm:w-28 sm:h-28 " +
    "rounded-full text-center font-bold uppercase " +
    "shadow-[0_0_10px_rgba(0,0,0,0.35)]";

  if (isGoodCatch) {
    // Walsh green coin
    return (
      <div
        aria-label="Good Catch"
        className={`${base} 
          border-4 border-green-700
          text-white
          text-[0.65rem] sm:text-xs
          bg-gradient-to-b from-green-400 via-green-600 to-green-700
          ${className}
        `}
      >
        Good<br />Catch
      </div>
    );
  }

  // Token of Excellence (gold coin)
  return (
    <div
      aria-label="Token of Excellence"
      className={`${base}
        border-4 border-yellow-600
        text-yellow-900
        text-[0.60rem] sm:text-xs
        bg-gradient-to-b from-yellow-200 via-yellow-400 to-yellow-600
        ${className}
      `}
    >
      Token of<br />Excellence
    </div>
  );
}
