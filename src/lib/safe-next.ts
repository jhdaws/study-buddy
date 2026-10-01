// Where to send someone after sign-in: the `next` parameter, made safe.
//
// `next` travels through query strings, hidden form fields and email links,
// so it is attacker-controlled input. Redirecting to it unchecked is an open
// redirect: a link to /auth/confirm?next=https://evil.example would bounce a
// freshly signed-in student to a look-alike site. So every redirect target
// that came from outside goes through safeNextPath() first -- the
// /auth/confirm route, signIn() and saveDisplayName() all use it.
//
// Pure and dependency-free (unit tested in safe-next.test.ts), so the proxy,
// Server Components and Client Components can all import it.

/**
 * The `?error=` value /auth/confirm sends to /login when a link did not work
 * (expired, used, malformed). /login shows its own message for it and
 * ignores any other value, so nothing from the URL is ever echoed.
 */
export const LINK_ERROR = "link";

/**
 * The request header the proxy sets to the path being requested (pathname
 * plus query), so requireUser() can send a signed-out student back to it.
 * The proxy always overwrites it, so a client cannot choose it; and it is
 * still only ever used through safeNextPath().
 */
export const REQUEST_PATH_HEADER = "x-study-buddy-path";

/** Where a signed-in student lands when no (safe) `next` was given. */
export const DEFAULT_NEXT_PATH = "/sessions";

/** Longer than any path this app has; anything bigger is not a real one. */
const MAX_LENGTH = 2048;

// A base that can never be this app's origin, used only to parse.
const PARSE_BASE = "http://safe-next.invalid";

/**
 * `value` as a path on this site -- pathname, query and hash -- or null if it
 * is not one.
 *
 * Accepts only strings that start with a single "/". Rejects:
 *   - absolute URLs (`https://evil.example`, `javascript:...`);
 *   - protocol-relative ones (`//evil.example`), and `/\evil.example`, which
 *     browsers also read as protocol-relative;
 *   - anything containing a backslash, whitespace or a control character --
 *     browsers strip tabs and newlines from URLs, so `/\t/evil.example`
 *     would become `//evil.example` after this check.
 * Then, belt and braces, the value is parsed as a URL and must still be on
 * the parse base's origin.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // Backslash, any whitespace (incl. Unicode spaces) and C0/DEL controls.
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_BASE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** safeNextPath(value), or DEFAULT_NEXT_PATH. */
export function safeNext(value: unknown): string {
  return safeNextPath(value) ?? DEFAULT_NEXT_PATH;
}

/** First value of a search param that may repeat (`?next=a&next=b`). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/login`, carrying `next` when it is safe and not the default. Where the
 * proxy and requireUser() send a signed-out visitor.
 */
export function loginPath(next?: unknown): string {
  return withNext("/login", next);
}

/** The first-sign-in name step (A4), carrying `next` the same way. */
export function displayNamePath(next?: unknown): string {
  return withNext("/login/name", next);
}

function withNext(path: string, next: unknown): string {
  const safe = safeNextPath(next);
  if (!safe || safe === DEFAULT_NEXT_PATH) return path;
  return `${path}?${new URLSearchParams({ next: safe })}`;
}
