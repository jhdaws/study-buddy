/**
 * The Study Buddy mark and wordmark (spec page 1): two overlapping discs --
 * two people, one session -- in a rounded blue tile. Original artwork; no
 * Vanderbilt marks anywhere in the app.
 */

export function LogoMark({ className = "size-8" }: { className?: string }) {
  // A flat navy tile, drawn with CSS so the logo can appear twice on a page
  // (top bar and sidebar) without SVG id collisions.
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-lg bg-brand ${className}`}
    >
      <svg viewBox="0 0 40 40" className="size-full" focusable="false">
        <circle cx="16" cy="20" r="7" fill="#ffffff" />
        <circle cx="24" cy="20" r="7" fill="#7fb0f2" fillOpacity="0.9" />
      </svg>
    </span>
  );
}

export default function Logo({
  tone = "dark",
  className = "",
}: {
  /** "dark" = navy text for sky surfaces; "light" = white text on dark glass. */
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span
        className={`text-[17px] font-bold tracking-tight whitespace-nowrap ${tone === "light" ? "text-white" : "text-ink"}`}
      >
        Study Buddy
      </span>
    </span>
  );
}
