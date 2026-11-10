// Security headers (SEC-10, threat model T13). Pure functions, so the policy
// is unit tested (security-headers.test.ts) rather than only seen in a
// browser.
//
// Two halves, set in two places:
//
//   - contentSecurityPolicy() -- per request, from src/proxy.ts, because it
//     carries a fresh nonce. Next reads the nonce back out of the REQUEST's
//     Content-Security-Policy header while rendering and puts it on its own
//     scripts (node_modules/next/dist/docs/01-app/02-guides/
//     content-security-policy.md). That only works for pages rendered per
//     request; every page here is, because the root layout's header reads
//     the session cookie. A page that became static would have its scripts
//     blocked -- the e2e journeys would fail on it.
//   - securityHeaders() -- the same on every response, from next.config.ts,
//     which also covers the static files the proxy's matcher skips.
//
// What the policy allows, and why:
//
//   script-src   Only scripts carrying this request's nonce, and what they
//                load ('strict-dynamic': Next's chunks, the Maps loader that
//                @vis.gl/react-google-maps inserts, and Google's own). No
//                'unsafe-inline'. 'unsafe-eval' in `next dev` only: React
//                uses eval there for error stacks; production needs none.
//                With a Maps key, 'wasm-unsafe-eval': the vector map's
//                renderer compiles WebAssembly, which CSP otherwise refuses
//                (seen in Chromium with a GPU; headless without one falls
//                back to raster tiles and never tries). It allows compiling
//                WebAssembly only -- not eval() or new Function() -- so it
//                stands in for the 'unsafe-eval' in Google's CSP guide.
//   style-src    <style> and <link> elements need the nonce too. The Maps API
//                copies it onto the <style> elements it inserts from the
//                first style[nonce] on the page: the empty one the root
//                layout renders for that purpose.
//                style-src-attr 'unsafe-inline' is for style="" attributes,
//                which a nonce cannot cover: React renders inline styles into
//                the server HTML (AuthScene, the code boxes in SignInForm),
//                and Google's map markup uses them throughout. `next dev`
//                injects CSS as un-nonced <style> tags, so dev allows inline.
//   connect-src  The Supabase project, from NEXT_PUBLIC_SUPABASE_URL, over
//                https and wss: the browser client's REST calls and Realtime's
//                WebSocket (the live roster).
//   Google       Only with a Maps browser key: the hosts in Google's own CSP
//                guide for the Maps JavaScript API
//                (developers.google.com/maps/documentation/javascript/
//                content-security-policy), which include places.googleapis.com
//                for the picker's Places calls. The map's vector renderer runs
//                in blob: workers; Roboto comes from Google Fonts.
//   frame-ancestors 'none'  No one may frame the app (clickjacking).
//
// upgrade-insecure-requests is sent only when Supabase is on https -- every
// real deployment. The local stack is plain http on 127.0.0.1, which the
// upgrade would break.

/**
 * The request header the nonce is passed to Server Components in (Next's
 * convention). The root layout reads it for its nonce-carrying <style>.
 */
export const NONCE_HEADER = "x-nonce";

export type ContentSecurityPolicyOptions = {
  /** This request's nonce, from createNonce(). */
  nonce: string;
  /** NEXT_PUBLIC_SUPABASE_URL. */
  supabaseUrl: string;
  /** Whether this deployment has a Maps browser key, and so loads Google Maps. */
  googleMaps: boolean;
  /** `next dev`: React and Next's dev tooling need eval and un-nonced styles. */
  dev: boolean;
};

/** A fresh, unguessable nonce: 128 random bits, base64. One per request. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** Google's documented sources for the Maps JavaScript API, by directive. */
const GOOGLE_MAPS_SOURCES = {
  "img-src": [
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://*.google.com",
    "https://*.googleusercontent.com",
  ],
  "connect-src": [
    "https://*.googleapis.com",
    "https://*.google.com",
    "https://*.gstatic.com",
    "data:",
    "blob:",
  ],
  "font-src": ["https://fonts.gstatic.com"],
  "style-src": ["https://fonts.googleapis.com"],
  "worker-src": ["blob:"],
  "frame-src": ["https://*.google.com"],
} as const;

type Directive =
  | "default-src"
  | "script-src"
  | "style-src"
  | "style-src-attr"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "worker-src"
  | "frame-src"
  | "object-src"
  | "base-uri"
  | "form-action"
  | "frame-ancestors";

/** The Content-Security-Policy header value for one request. */
export function contentSecurityPolicy({
  nonce,
  supabaseUrl,
  googleMaps,
  dev,
}: ContentSecurityPolicyOptions): string {
  const supabase = new URL(supabaseUrl);
  const supabaseSocket = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;
  const google = (directive: keyof typeof GOOGLE_MAPS_SOURCES): readonly string[] =>
    googleMaps ? GOOGLE_MAPS_SOURCES[directive] : [];

  const directives: Record<Directive, readonly string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(googleMaps ? ["'wasm-unsafe-eval'"] : []),
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // A nonce would switch 'unsafe-inline' off, so dev has one or the other.
    "style-src": ["'self'", dev ? "'unsafe-inline'" : `'nonce-${nonce}'`, ...google("style-src")],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...google("img-src")],
    "font-src": ["'self'", ...google("font-src")],
    "connect-src": ["'self'", supabase.origin, supabaseSocket, ...google("connect-src")],
    "worker-src": google("worker-src"),
    "frame-src": google("frame-src"),
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives)
    // An empty directive would mean 'none'; leaving it out falls back to
    // default-src 'self' instead.
    .filter(([, sources]) => sources.length > 0)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`);
  if (supabase.protocol === "https:") parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** The headers that are the same on every response (next.config.ts). */
export function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
    // For browsers too old for CSP's frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
