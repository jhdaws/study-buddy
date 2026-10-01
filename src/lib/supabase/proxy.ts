// Session refresh and route protection, called from src/proxy.ts on every
// matched request.
//
// 1. Refresh the Supabase session cookie (getUser() triggers it).
// 2. Signed out and asking for a page under /sessions: redirect to
//    /login?next=<that path> (A4, #17). Only GET and HEAD -- a POST is a
//    Server Action, which checks for itself with requireUser() and redirects
//    properly; a proxy redirect would turn it into a broken fetch.
//    /api/* is never redirected (docs/contracts.md): an API answers with a
//    status, not a login page.
// 3. Tell requireUser() which path was asked for, in REQUEST_PATH_HEADER.
//
// This is an optimistic, convenience check -- the Next 16 authentication
// guide's "optimistic checks with Proxy". The real ones are requireUser()
// and RLS: a matcher change or a moved Server Function can silently drop
// the proxy's coverage, and they do not depend on it.
//
// THE COOKIE RULES. The response returned here MUST be the one carrying the
// refreshed cookies; building a fresh NextResponse instead silently drops
// them and logs the user out on the next navigation. A redirect IS a fresh
// response, so it gets every cookie (and the no-cache headers) that the
// refresh put on `response` copied across -- including the deletions
// Supabase writes when a session has expired for good.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "@/lib/env";
import { loginPath, REQUEST_PATH_HEADER } from "@/lib/safe-next";

/** Pages a signed-out visitor is sent to /login from. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === "/sessions" || pathname.startsWith("/sessions/");
}

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = supabaseEnv();
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  // Always overwritten, so a client cannot supply its own.
  request.headers.set(REQUEST_PATH_HEADER, path);

  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Write the refreshed tokens to the request, so Server Components
        // rendering this request see them, and to the response, so the
        // browser stores them.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // No-cache headers, so a CDN never serves one user's session cookie
        // to another user.
        cacheHeaders = headers;
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between creating the client and this call: getUser() is
  // what triggers the token refresh. With no session cookie it returns
  // without a network round trip.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPageRequest = request.method === "GET" || request.method === "HEAD";
  if (!user && isPageRequest && isProtectedPath(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL(loginPath(path), request.url));
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    for (const [key, value] of Object.entries(cacheHeaders)) {
      redirect.headers.set(key, value);
    }
    return redirect;
  }

  return response;
}
