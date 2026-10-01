// This deployment's origin (`https://study-buddy-jdaws.vercel.app`,
// `http://localhost:3000`, a Vercel preview URL), worked out from the
// request headers -- so the magic link brings a student back to the same
// deployment they asked from.
//
// Pure (unit tested in request-origin.test.ts). Callers pass `await
// headers()` from next/headers.
//
// Which header to trust:
//   1. `Origin`. Browsers send it on every Server Action POST, and Next
//      rejects an action whose Origin does not match its Host /
//      X-Forwarded-Host (the CSRF check in the Next 16 Server Actions
//      guide), so when present it is this site.
//   2. Otherwise `X-Forwarded-Host` (set by Vercel), then `Host`, with
//      `X-Forwarded-Proto`; http only for localhost.
// Either can be forged by a caller that is not a browser. That is tolerable
// here because the result only becomes `emailRedirectTo`, and Supabase Auth
// ignores any redirect not on its allow list (A1) -- a forged host gets the
// Site URL instead, never the forger's site.

/** The origin of the request, or null if the headers do not give one. */
export function requestOrigin(headers: Pick<Headers, "get">): string | null {
  const origin = parseOrigin(headers.get("origin"));
  if (origin) return origin;

  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host"));
  if (!host) return null;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const forwardedProto = firstValue(headers.get("x-forwarded-proto"));
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : local
        ? "http"
        : "https";
  return parseOrigin(`${proto}://${host}`);
}

function firstValue(value: string | null): string | undefined {
  // Proxies may append: "a.example, b.example". The first is the client's.
  const first = value?.split(",")[0]?.trim();
  return first || undefined;
}

function parseOrigin(value: string | null | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Only scheme, host and port: anything else in the header is dropped.
    return url.origin;
  } catch {
    return null;
  }
}
