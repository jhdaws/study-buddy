/**
 * Shared Tailwind class strings for the design system (Claude Design spec,
 * 2026-10-11, pages 4-7). Plain strings, so Server and Client Components can
 * both import them and nothing ships to the browser but the classes.
 *
 * Every control is at least 44px tall (`min-h-11`) and every input is
 * `text-base`, so iOS Safari does not zoom (ADR 0004). Tests check for both.
 *
 * Inputs and labels here are for DARK glass, which is where every form in
 * the app sits (the sign-in card and the host-a-session sections).
 */

/** A pill input on dark glass. Red border when `aria-invalid`. */
export const INPUT =
  "block h-14 min-h-11 w-full rounded-full border border-white/20 bg-white/[0.08] px-5 " +
  "text-base text-white placeholder:text-white/55 transition-colors " +
  "hover:border-white/35 focus:border-blue-300 focus:bg-white/[0.12] focus:outline-none " +
  "focus-visible:outline-none focus:ring-4 focus:ring-blue-300/25 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-danger-on-dark aria-[invalid=true]:ring-danger-on-dark/20";

/** The same field as a native <select>, with room for the arrow. */
export const SELECT =
  `${INPUT} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] ` +
  "bg-[length:20px] bg-[position:right_1.25rem_center] bg-no-repeat pr-12 " +
  "[&>option]:bg-navy-800 [&>option]:text-white";

export const LABEL = "block px-1 text-sm font-semibold text-white";
export const HINT = "px-1 text-sm text-white/72";
export const FIELD = "flex flex-col gap-1.5";
export const FIELD_ERROR =
  "flex items-start gap-2 px-1 text-sm font-medium text-danger-on-dark " +
  "before:mt-1.5 before:size-2.5 before:shrink-0 before:rounded-full before:bg-danger-on-dark before:content-['']";

/** A form-level problem: an inline alert inside the card (spec 5.2d). */
export const FORM_ERROR =
  "rounded-inner border border-danger-on-dark/40 bg-danger/15 px-4 py-3 text-base text-danger-on-dark";

const BUTTON_BASE =
  "inline-flex h-12 min-h-11 items-center justify-center gap-2 rounded-full px-6 text-base " +
  "font-bold transition-[background-color,transform] active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:active:scale-100";

/** White pill: the main action on dark glass ("Send code", "Sign in"). */
export const BUTTON_PRIMARY =
  `${BUTTON_BASE} bg-white text-navy-900 shadow-[0_8px_24px_-8px_rgba(255,255,255,0.45)] ` +
  "hover:bg-sky-50 disabled:bg-white/25 disabled:text-white/70 disabled:shadow-none";

/** Blue pill: the main action on sky surfaces ("Host a session"). */
export const BUTTON_PRIMARY_LIGHT =
  `${BUTTON_BASE} bg-blue-600 text-white shadow-[0_10px_24px_-10px_rgba(47,116,200,0.8)] ` +
  "hover:bg-navy-600 disabled:opacity-60";

/** Outlined pill on dark glass. */
export const BUTTON_SECONDARY =
  `${BUTTON_BASE} border border-white/25 bg-white/[0.06] text-white hover:bg-white/[0.12] ` +
  "disabled:opacity-50";

/** Outlined pill on sky surfaces. */
export const BUTTON_SECONDARY_LIGHT =
  `${BUTTON_BASE} border border-navy-900/15 bg-white/60 text-navy-900 hover:bg-white`;

/** A text link on dark glass. */
export const LINK_ON_DARK =
  "inline-flex min-h-11 items-center text-sm font-semibold text-blue-200 underline-offset-4 hover:underline";

/** A dark glass card, the spec's 24px radius. */
export const CARD_DARK = "glass-dark rounded-card text-white";

/** A section heading on sky surfaces. */
export const SECTION_TITLE = "text-xl font-extrabold tracking-tight text-navy-900";
