"use client";

type Props = {
  type: "token" | "goodCatch";
  size?: "md" | "lg";
  interactive?: boolean;   // tap/clickable
  selected?: boolean;      // draw a thicker ring
  onClick?: () => void;    // handler when interactive
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

  // Token of Excellence: green with white text
  // Good Catch: gold with green text
  const bg = isToken
    ? "bg-gradient-to-b from-green-500 to-green-700 text-white"
    : "bg-gradient-to-b from-amber-300 to-yellow-500 text-emerald-800";

  const ring = selected ? "ring-4 ring-black/25" : "ring-2 ring-black/10";
  const hover = interactive ? "cursor-pointer hover:scale-[1.03] transition-transform" : "";

  return (
    <button
      type="button"
      aria-label={isToken ? "Token of Excellence" : "Good Catch"}
      onClick={interactive ? onClick : undefined}
      className={`relative ${dims} flex items-center justify-center rounded-full
                  font-extrabold text-center shadow-lg select-none token-shimmer
                  ${bg} ${ring} ${hover}`}
    >
      <span className={`leading-tight text-xs md:text-sm tracking-wide ${isToken ? "text-white" : "text-emerald-800"}`}>
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
