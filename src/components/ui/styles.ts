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

// --- Light surfaces ---------------------------------------------------------

export const INPUT =
  "block h-12 min-h-11 w-full rounded-xl border border-field bg-white px-3.5 text-base text-ink " +
  "placeholder:text-ink-2/80 transition-colors focus:border-signal focus:ring-4 " +
  "focus:ring-signal/15 focus:outline-none focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-2 " +
  "aria-[invalid=true]:border-danger-on-light aria-[invalid=true]:ring-danger-on-light/15";

export const SELECT =
  `${INPUT} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%234a5b78' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] ` +
  "bg-[length:18px] bg-[position:right_0.875rem_center] bg-no-repeat pr-10";

export const LABEL = "block text-sm font-semibold text-ink";
export const HINT = "text-sm text-ink-2";
export const FIELD = "flex flex-col gap-1.5";
export const FIELD_ERROR = "text-sm font-medium text-danger-on-light";
export const FORM_ERROR =
  "rounded-xl border border-danger-on-light/30 bg-danger-on-light/5 px-4 py-3 text-[15px] text-danger-on-light";

const BUTTON_BASE =
  "inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] " +
  "font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Navy: the one main action on a page. */
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-brand text-white hover:bg-navy-700`;

/** White with a border: everything else. */
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-line bg-white text-ink hover:border-field`;

export const LINK =
  "inline-flex min-h-11 items-center text-[15px] font-semibold text-signal underline-offset-4 hover:underline";

/** A white panel with a hairline border -- lists, form sections. */
export const PANEL = "rounded-2xl border border-line bg-white";

export const PAGE_TITLE = "text-[28px] leading-tight font-bold tracking-tight text-ink";
export const PAGE_LEAD = "mt-1 text-[15px] text-ink-2";
export const SECTION_TITLE = "text-[17px] font-bold text-ink";

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
