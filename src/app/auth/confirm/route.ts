// Magic-link landing route (US-01). Owner: Track A -- A3 (#16); the email
// template that links here is A1's (#14): supabase/templates/magic_link.html,
// pasted into the hosted project's dashboard too (supabase/README.md).
//
//   GET /auth/confirm?next=/sessions/new&token_hash=...&type=email
//
// 1. Read token_hash and type. Missing or of a kind we never send: back to
//    /login with ?error=link.
// 2. verifyOtp({ type, token_hash }) through the server client. On success
//    it writes the session cookies; Next merges cookies set during a Route
//    Handler into the redirect it returns (checked in next/dist's
//    app-route module), so the student arrives signed in.
// 3. Failure (expired, already used, unknown): /login?error=link, keeping
//    `next`, so they can ask for a new link and still end up where they
//    were going.
// 4. Success: on to `next` -- ONLY a same-origin path (safeNextPath), else
//    /sessions. Accepting an absolute URL here would make this an open
//    redirect on a page every student is sent to by email.
//
// ONE-TIME LINKS AND MAIL SCANNERS: a GET here spends the token. A mail
// security scanner that follows links before the student does (Microsoft
// Defender's Safe Links can) would spend it first and the student would see
// "link expired". Unverified for Vanderbilt's mail -- see HANDOFF.md.

import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { LINK_ERROR, safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * The OTP types our emails carry. The template sends `email`; `magiclink`
 * and `signup` are the older names for the same two emails. Never
 * `recovery`, `invite` or `email_change`: we send none of those, and a
 * link of that kind arriving here is not one of ours.
 */
const ACCEPTED_TYPES: ReadonlySet<string> = new Set(["email", "magiclink", "signup"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const next = safeNext(params.get("next"));

  if (!tokenHash || !type || !ACCEPTED_TYPES.has(type)) {
    return redirectTo(request, loginWithError(next));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });
  if (error || !data.user) {
    return redirectTo(request, loginWithError(next));
  }

  return redirectTo(request, next);
}

function loginWithError(next: string): string {
  return `/login?${new URLSearchParams({ error: LINK_ERROR, next })}`;
}

/**
 * Redirect to a path on THIS origin. `path` is always one we built or one
 * safeNextPath() accepted, and resolving it against the request's own origin
 * means it cannot point anywhere else.
 */
function redirectTo(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
  // The token is single-use and the session is per student: never cache.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
