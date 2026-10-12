// Session refresh and route protection, called from src/proxy.ts on every
// matched request. Owner: Track A -- refresh is W4's, protection is A4 (#17).
//
// The response returned here MUST be the one carrying the refreshed cookies;
// building a fresh NextResponse instead silently drops them and logs the user
// out on the next navigation. That applies to the redirects below too, which
// is why each one copies the cookies across rather than being returned bare.
//
// This is a convenience, not the security boundary. Next's own proxy docs are
// explicit that Server Functions are POSTs to the route they live on, so a
// matcher change can take a Server Function out of proxy coverage without
// anyone noticing. requireUser() (./server.ts) re-checks inside every action
// and page that matters, and RLS re-checks in the database (ADR 0008 rule
// 10). Three layers, and only the last one is load-bearing.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/env";
import { isPrivatePath, LOGIN_PATH, NAME_STEP_PATH } from "@/lib/redirects";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Only the /sessions tree is gated, so the home page and the whole sign-in
  // journey stay reachable, and the profile lookup below costs nothing on
  // requests that do not need it.
  if (isPrivatePath(pathname)) {
    if (!user) {
      // Keep where they were going, so the magic link returns them there
      // rather than dumping everyone on the session list.
      return redirectPreservingCookies(request, response, LOGIN_PATH, {
        next: pathWithQuery(request),
      });
    }

    // ADR 0008 rule 1: the profile row exists from signup with no name. Send
    // them to the name step "before anything else", which is what A4 asks
    // for -- requireUser() repeats this check for Server Functions, which
    // may never pass through here.
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.display_name?.trim()) {
      return redirectPreservingCookies(request, response, NAME_STEP_PATH, {
        next: pathWithQuery(request),
      });
    }
  }

  return response;
}

/** The path the user asked for, query included, for `?next=`. */
function pathWithQuery(request: NextRequest): string {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/**
 * Redirect to `path`, carrying over any cookies Supabase just refreshed.
 *
 * NextResponse.redirect() starts from an empty response, so without this the
 * refreshed tokens are thrown away and the redirect signs the user out --
 * exactly the failure the note at the top of this file warns about.
 */
function redirectPreservingCookies(
  request: NextRequest,
  response: NextResponse,
  path: string,
  params: Record<string, string>,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path;
  // Drop the original query: its parameters belonged to the page we are
  // leaving. What matters is carried in `next`.
  url.search = "";
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
