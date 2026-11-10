// Magic-link landing route (US-01). Owner: Track A -- A3 (#16); the email
// template that links here is A1's (#14): supabase/templates/magic_link.html,
// pasted into the hosted project's dashboard too (supabase/README.md).
//
//   GET /auth/confirm?next=/sessions/new&token_hash=...&type=email
//
// 1. A token_hash link (our template, A7): check the type is one we send and
//    hand it to /login/continue WITHOUT verifying it. The student spends the
//    token there by pressing "Continue signing in" (confirmSignIn()). A GET
//    that verified it let Outlook's link scanner, which opens links before
//    the student does, spend the one-time token, and the email's code (the
//    same token) died with it. See src/lib/email-link.ts.
// 2. A `code` (Supabase's default email, below): exchange it here. Its
//    token was already spent at Supabase's own /verify, so there is nothing
//    left for a scanner to take; the code only works in the browser that
//    asked for the email.
// 3. Anything else, or a failed exchange: /login?error=link, keeping `next`.
// 4. `next` is ONLY ever a same-origin path (safeNext), else /sessions.
//    Accepting an absolute URL here would make this an open redirect on a
//    page every student is sent to by email.

import { type NextRequest, NextResponse } from "next/server";

import { continuePath, isAcceptedLinkType, loginWithLinkError } from "@/lib/email-link";
import { safeNext } from "@/lib/safe-next";
import { createClient, pathAfterSignIn } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const next = safeNext(params.get("next"));

  // SUPABASE'S DEFAULT EMAIL (A5, #35). Until custom SMTP unlocks our own
  // template on the hosted project, Supabase sends its default email: a link
  // through its own /verify, which comes back here with a one-time `code`
  // instead of a token_hash. That code can only be exchanged in the browser
  // that asked for the email (signIn() left a code-verifier cookie there), so
  // the link works on the same device and fails cleanly anywhere else.
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      return redirectTo(request, loginWithLinkError(next));
    }
    return redirectTo(request, await pathAfterSignIn(supabase, data.user, next));
  }

  if (!tokenHash || !isAcceptedLinkType(type)) {
    return redirectTo(request, loginWithLinkError(next));
  }

  // Not verified here: see step 1 at the top of this file.
  return redirectTo(request, continuePath(tokenHash, type, next));
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
