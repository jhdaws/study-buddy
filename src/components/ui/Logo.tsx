/**
 * The Study Buddy mark and wordmark (spec page 1): two overlapping discs --
 * two people, one session -- in a rounded blue tile. Original artwork; no
 * Vanderbilt marks anywhere in the app.
 */

export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="sb-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8cc4f5" />
          <stop offset="1" stopColor="#2f74c8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#sb-tile)" />
      <circle cx="16" cy="20" r="7.5" fill="#ffffff" />
      <circle cx="24" cy="20" r="7.5" fill="#0e2547" fillOpacity="0.85" />
      <path d="M20 13.7a7.5 7.5 0 0 1 0 12.6 7.5 7.5 0 0 1 0-12.6Z" fill="#5aa8f0" />
    </svg>
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
        className={`text-lg font-extrabold tracking-tight whitespace-nowrap ${tone === "light" ? "text-white" : "text-navy-900"}`}
      >
        Study Buddy
      </span>
    </span>
  );
}
