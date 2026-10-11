/**
 * The Study Buddy mark and wordmark (spec page 1): two overlapping discs --
 * two people, one session -- in a rounded blue tile. Original artwork; no
 * Vanderbilt marks anywhere in the app.
 */

export function LogoMark({ className = "size-9" }: { className?: string }) {
  // The tile is a CSS gradient, not an SVG <linearGradient>: an SVG gradient
  // needs a document-unique id, and the logo appears twice (top bar and
  // sidebar), one of them display:none -- a url(#id) pointing into a hidden
  // copy renders nothing.
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-[28%] bg-gradient-to-br from-blue-300 to-blue-600 ${className}`}
    >
      <svg viewBox="0 0 40 40" className="size-full" focusable="false">
        <circle cx="16" cy="20" r="7.5" fill="#ffffff" />
        <circle cx="24" cy="20" r="7.5" fill="#0e2547" fillOpacity="0.85" />
        <path d="M20 13.7a7.5 7.5 0 0 1 0 12.6 7.5 7.5 0 0 1 0-12.6Z" fill="#5aa8f0" />
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
        className={`text-lg font-extrabold tracking-tight whitespace-nowrap ${tone === "light" ? "text-white" : "text-navy-900"}`}
      >
        Study Buddy
      </span>
    </span>
  );
}
