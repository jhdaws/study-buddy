/**
 * Shared Tailwind class strings. Plain strings, so Server and Client
 * Components can both import them and nothing ships to the browser but the
 * classes.
 *
 * Two sets:
 *   - the default set is for the app's light surfaces (white on paper),
 *     where nearly everything lives;
 *   - the `_ON_DARK` set is for the sign-in scene's navy card.
 *
 * Every control is at least 44px tall (`min-h-11`) and every input is
 * `text-base`, so iOS Safari does not zoom (ADR 0004). Tests check for both.
 */

// --- Light surfaces (2026-10-20 redesign) -----------------------------------
//
// Controls are 36px on desktop and 44px on phones (`min-h-11 lg:min-h-9`);
// inputs use 16px text on phones so iOS does not zoom, 14px from lg up.

export const INPUT =
  "block h-11 min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink " +
  "placeholder:text-ink-3 transition-colors lg:h-9 lg:min-h-9 lg:text-sm " +
  "focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent " +
  "disabled:cursor-not-allowed disabled:bg-page disabled:text-ink-2 " +
  "aria-[invalid=true]:border-error";

export const SELECT =
  `${INPUT} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] ` +
  "bg-[length:16px] bg-[position:right_0.625rem_center] bg-no-repeat pr-9";

export const LABEL = "block text-[13px] font-semibold text-ink";
export const HINT = "text-xs text-ink-2";
export const FIELD = "flex flex-col gap-1.5";
export const FIELD_ERROR = "text-xs font-medium text-error";
export const FORM_ERROR =
  "rounded-lg border border-error/30 bg-[#FDECEA] px-3 py-2.5 text-sm text-error";

const BUTTON_BASE =
  "inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 text-sm " +
  "font-medium whitespace-nowrap transition-colors lg:h-9 lg:min-h-9 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** The one blue action on a page. */
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-accent text-white hover:bg-accent-hover`;

/** White with a border: everything else. */
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-line bg-white text-ink hover:border-line-strong`;

/** Secondary, destructive: Leave session. */
export const BUTTON_DANGER = `${BUTTON_BASE} border border-line bg-white text-error hover:bg-[#FDECEA]`;

export const LINK =
  "inline-flex min-h-11 items-center text-sm font-medium text-accent hover:text-accent-hover hover:underline lg:min-h-9";

/** A white card with a hairline border. */
export const PANEL =
  "rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)]";

/** Frosted card over the mist. */
export const GLASS_PANEL = "rounded-xl border border-[rgba(17,24,39,0.06)] glass";

export const PAGE_TITLE = "text-[26px] leading-[1.2] font-bold tracking-[-0.02em] text-ink [text-wrap:pretty]";
export const PAGE_LEAD = "max-w-[560px] text-sm text-ink-body [text-wrap:pretty]";
export const SECTION_TITLE = "text-[15px] font-semibold text-ink";

/** A pill toggle in a filter row; aria-pressed drives the look. */
export const FILTER_PILL =
  "inline-flex h-11 min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] " +
  "font-medium text-ink transition-colors hover:border-line-strong lg:h-8 lg:min-h-8 " +
  "aria-pressed:border-accent aria-pressed:text-accent";

// --- The sign-in scene's navy card ------------------------------------------

export const INPUT_ON_DARK =
  "block h-12 min-h-11 w-full rounded-xl border border-white/25 bg-white/[0.08] px-4 " +
  "text-base text-white placeholder:text-white/60 transition-colors " +
  "focus:border-blue-200 focus:bg-white/[0.12] focus:ring-4 focus:ring-blue-200/20 " +
  "focus:outline-none focus-visible:outline-none " +
  "aria-[invalid=true]:border-danger-on-dark aria-[invalid=true]:ring-danger-on-dark/20";

export const LABEL_ON_DARK = "block text-sm font-semibold text-white";
export const FIELD_ERROR_ON_DARK = "text-sm font-medium text-danger-on-dark";
export const FORM_ERROR_ON_DARK =
  "rounded-xl border border-danger-on-dark/40 bg-danger/15 px-4 py-3 text-[15px] text-danger-on-dark";

/** White on the navy card. */
export const BUTTON_ON_DARK =
  `${BUTTON_BASE} bg-white text-ink hover:bg-sky-50 disabled:bg-white/30 disabled:text-white/80 disabled:opacity-100`;

export const LINK_ON_DARK =
  "inline-flex min-h-11 items-center text-sm font-semibold text-blue-200 underline-offset-4 hover:underline";
