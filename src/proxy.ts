import type { NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/env";
import { contentSecurityPolicy, createNonce, NONCE_HEADER } from "@/lib/security-headers";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every matched request:
 *
 * 1. Builds this request's Content-Security-Policy with a fresh nonce
 *    (SEC-10; the policy and its reasons are in @/lib/security-headers).
 *    It goes on the REQUEST, before updateSession() forwards the request
 *    headers, because that is where Next reads the nonce from to stamp its
 *    own scripts -- and on the response, for the browser. Both are always
 *    overwritten, so a client cannot supply its own.
 * 2. Refreshes the Supabase session cookie and sends signed-out visitors
 *    from /sessions* to /login?next=... (A4). The logic, and the rules for
 *    not losing cookies, are in @/lib/supabase/proxy: whatever response it
 *    returns, redirect or not, is the one that carries them, so the CSP is
 *    added to that response rather than to a new one.
 *
 * The other security headers do not change per request; next.config.ts sets
 * them on every response, including the static files this matcher skips.
 */
export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const policy = contentSecurityPolicy({
    nonce,
    supabaseUrl: supabaseEnv().url,
    googleMaps: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    dev: process.env.NODE_ENV === "development",
  });
  request.headers.set("Content-Security-Policy", policy);
  request.headers.set(NONCE_HEADER, nonce);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
