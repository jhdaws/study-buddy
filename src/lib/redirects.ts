// Where a user is sent after signing in, and the check that keeps that
// destination on this site.
//
// Owner: Track A (A3 #16, A4 #17). Used by /auth/confirm, saveDisplayName(),
// the proxy's route protection, and the /login page -- all four read a `next`
// value that ultimately came from a URL or a form field, which means it came
// from whoever sent the link.
//
// Client-safe: no imports, so a Client Component can use it without pulling
// anything server-only or heavy into the bundle.

/** Where sign-in lands when nothing better is known. */
export const DEFAULT_SIGNED_IN_PATH = "/sessions";

/** The sign-in screen. */
export const LOGIN_PATH = "/login";

/**
 * The display-name step (A4 #17, ADR 0008 rule 1).
 *
 * docs/contracts.md left the route to A4; this is it. Under /login so that
 * one `?next=` convention covers the whole sign-in journey, and so the proxy
 * can treat the whole prefix as "part of signing in" rather than listing
 * paths.
 */
export const NAME_STEP_PATH = "/login/name";

/**
 * Whether a path needs a signed-in user with a display name.
 *
 * Just the /sessions tree for now, which is what A4 asks for. Everything
 * else -- the home page, /login and its name step, /auth/confirm -- has to
 * stay reachable while signed out, or signing in becomes impossible.
 *
 * `/api/*` is deliberately NOT here. docs/contracts.md: never make the proxy
 * redirect an API route. A fetch that gets a 307 to an HTML page fails in a
 * way the caller cannot read; a route handler that wants to refuse should
 * check for itself and answer 401.
 */
export function isPrivatePath(pathname: string): boolean {
  return pathname === "/sessions" || pathname.startsWith("/sessions/");
}

/**
 * `value` if it is a path on this origin, else null.
 *
 * The one job here is refusing to become an open redirect: a magic link is
 * emailed, and `?next=https://evil.example/` in one would otherwise bounce a
 * freshly signed-in student straight off the site, with the referrer and any
 * trust that follows from having just arrived from a real Study Buddy email.
 *
 * Accepted: an absolute path, with an optional query and fragment --
 * `/sessions`, `/sessions/new?x=1`, `/sessions#list`.
 *
 * Refused, each for its own reason:
 *   - anything not starting with `/` -- `https://evil.example`, `evil.example`
 *   - `//evil.example` -- protocol-relative, which a browser treats as
 *     absolute, and the single most common way this check is got around
 *   - a backslash anywhere -- browsers normalise `\` to `/`, so `/\evil.example`
 *     becomes `//evil.example` after this function would have approved it
 *   - control characters, including tab, newline and NUL -- browsers strip
 *     them from URLs, so `/\t/evil.example` is another spelling of the above
 *
 * Deliberately not using `new URL(value, origin)` and comparing origins:
 * that needs an origin to resolve against (so it cannot run on the client,
 * and the server's idea of its own origin comes from a header), and it
 * silently accepts the normalisations listed above rather than refusing them.
 * A string check with no parsing has no such gaps.
 */
export function sameOriginPath(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  return value;
}

/**
 * `sameOriginPath(value)`, falling back to the default landing path.
 *
 * For the callers that must end up somewhere: /auth/confirm after a verified
 * token, saveDisplayName() after a successful save.
 */
export function safeNextPath(value: unknown): string {
  return sameOriginPath(value) ?? DEFAULT_SIGNED_IN_PATH;
}
