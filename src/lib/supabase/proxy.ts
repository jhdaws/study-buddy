// Session refresh, called from src/proxy.ts on every matched request.
//
// TODO (T-E1, once sign-in exists): redirect signed-out users away from
// private routes, preserving the path they wanted in a ?next= param. Adding it
// before /login works would lock everyone out of /sessions.
//
// The response returned here MUST be the one carrying the refreshed cookies;
// building a fresh NextResponse instead silently drops them and logs the user
// out on the next navigation.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
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
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between creating the client and this call: getUser() is
  // what triggers the token refresh. With no session cookie it returns
  // without a network round trip.
  await supabase.auth.getUser();

  return response;
}
