// Each department's colours, from the 2026-10-20 redesign: a small square in
// the sidebar and calendar, and a two-colour wash behind its session cards.
// Pure, so cards render the same on the server and in the browser.
//
// The design names seven departments. Any other code gets one of a fixed set
// of pairs, chosen from the code itself, so a department always keeps the
// same colour without anyone maintaining a list.

export type DepartmentColours = {
  /** The solid square: sidebar course rows, calendar blocks' edge. */
  square: string;
  /** The wash: [top-right colour, bottom-left colour]. */
  gradient: readonly [string, string];
};

const NAMED: Record<string, DepartmentColours> = {
  CS: { square: "#6A8AE0", gradient: ["#8FA8FF", "#C3A8FF"] },
  MATH: { square: "#D49A3A", gradient: ["#FFB08A", "#FFE2B8"] },
  CHEM: { square: "#3FA683", gradient: ["#86E0D8", "#CDEFD9"] },
  ECON: { square: "#D8706A", gradient: ["#FF9E8C", "#FFD6B8"] },
  BSCI: { square: "#A27CD8", gradient: ["#C9A8FF", "#FFBAD4"] },
  PSY: { square: "#3EA6C4", gradient: ["#94D6F5", "#A9E8E0"] },
  EECE: { square: "#CE7099", gradient: ["#FFA3C4", "#FFCB9E"] },
};

const FALLBACKS: DepartmentColours[] = Object.values(NAMED);

/** A small, stable hash: the same code always lands on the same pair. */
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** The colours for a department code, like `CS` or `PHYS`. */
export function departmentColours(code: string): DepartmentColours {
  const key = code.trim().toUpperCase();
  return NAMED[key] ?? FALLBACKS[hash(key) % FALLBACKS.length];
}

/**
 * The card background: two soft radial washes over white. `quiet` (a full
 * session) turns them down. Past and cancelled sessions get no wash at all;
 * the caller passes plain white for those.
 */
export function cardWash(code: string, quiet = false): string {
  const [a, b] = departmentColours(code).gradient;
  const [ka, kb] = quiet ? ["55", "44"] : ["8C", "73"];
  return (
    `radial-gradient(95% 130% at 100% 0%, ${a}${ka} 0%, ${a}00 62%), ` +
    `radial-gradient(80% 110% at 0% 100%, ${b}${kb} 0%, ${b}00 58%), #FFFFFF`
  );
}
