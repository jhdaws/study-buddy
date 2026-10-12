// Magic-link landing route (US-01). Owner: Track A -- A3 (#16).
//
// The hosted Supabase email template must point here with `token_hash` and
// `type` (A1, #14); the local template in supabase/config.toml does.
//
// A GET Route Handler rather than a page: there is nothing to render. It
// exchanges the token for session cookies and redirects. A Route Handler can
// set cookies, which a Server Component cannot -- that is why the exchange
// has to happen here and not in a page.
//
// SECURITY: `next` is attacker-supplied -- it arrives in a link sent by
// email. It goes through safeNextPath(), which only lets through a path on
// this origin, so this route cannot be turned into an open redirect
// (src/lib/redirects.ts).

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { safeNextPath } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

/** Back to /login with one unexplained failure message (see errors.ts). */
const LINK_FAILED = "/login?error=link";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const next = safeNextPath(params.get("next"));

  if (!tokenHash || !type) {
    // Someone opened /auth/confirm directly, or a mail client mangled the
    // link. Nothing to verify.
    redirect(LINK_FAILED);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });

  if (error) {
    // Expired, already used, or tampered with. Which one is not worth
    // telling anyone -- see confirmLinkErrorMessage() in src/lib/errors.ts.
    redirect(LINK_FAILED);
  }

  // verifyOtp set the session cookies on this response. A4's proxy sends the
  // user on to the name step if they have not chosen one yet, so this does
  // not need to know about that.
  redirect(next);
}
