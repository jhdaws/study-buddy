/**
 * The Study Buddy mark and wordmark, from the 2026-10-20 redesign: a dark
 * rounded square holding a small white outlined square. Drawn with CSS, so it
 * can appear more than once on a page. Original artwork; no Vanderbilt marks.
 */

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center bg-dark"
      style={{ width: size, height: size, borderRadius: size * 0.29 }}
    >
      <span
        className="block border-2 border-white"
        style={{ width: size * 0.36, height: size * 0.36, borderRadius: size * 0.1 }}
      />
    </span>
  );
}

export default function Logo({
  tone = "dark",
  size = 28,
  className = "",
}: {
  /** "dark" = ink text on light surfaces; "light" = white text on the sign-in scene. */
  tone?: "dark" | "light";
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span
        className={`text-[15px] font-semibold tracking-[-0.01em] whitespace-nowrap ${tone === "light" ? "text-white" : "text-ink"}`}
      >
        Study Buddy
      </span>
    </span>
  );
}
