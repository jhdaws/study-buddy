import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security-headers";

// BUG-19: the two Google keys are a pair. With only the browser key, the
// picker offers real Google places that createSession() cannot verify (no
// server key), so every create crashes to the error page. With only the
// server key, the picker offers fixture places that a keyed production
// build refuses. Either way no session can be created -- so a Vercel
// production build with half the pair fails here, and the previous
// deployment stays live. CI, previews and local builds are not checked:
// they run with neither key (src/lib/places.ts, THE FIXTURE IDS).
if (process.env.VERCEL_ENV === "production") {
  const browserKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const serverKey = Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY);
  if (browserKey !== serverKey) {
    throw new Error(
      `Google Maps keys: set both NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and ` +
        `GOOGLE_MAPS_SERVER_API_KEY in Vercel's Production environment, or ` +
        `neither. Missing: ${browserKey ? "GOOGLE_MAPS_SERVER_API_KEY" : "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"}. ` +
        `See .env.example and docs/bug_database.md (BUG-19).`,
    );
  }
}

const nextConfig: NextConfig = {
  // Says nothing a visitor needs, and tells an attacker which framework to
  // look up (SEC-10).
  poweredByHeader: false,
  // SEC-10: the headers that are the same on every response, static files
  // included. The Content-Security-Policy carries a per-request nonce, so it
  // is set in src/proxy.ts instead.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
