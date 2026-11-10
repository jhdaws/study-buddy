import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security-headers";

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
