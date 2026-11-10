// The emailed sign-in link (A7). The link in A1's template lands on
// /auth/confirm, which no longer verifies it: it hands the token to
// /login/continue, and only the "Continue signing in" button there
// (confirmSignIn() in src/app/login/actions.ts) spends it.
//
// Why: the token is one-time, and Vanderbilt mail goes through Outlook, whose
// link scanner opens links before the student does. A GET that verified the
// token let the scanner spend it, and since the email's code is the same
// token, the code then failed too. Scanners open links; they don't press
// buttons.
//
// Kept here, not in the "use server" actions file, because that file may only
// export async functions.

import { LINK_ERROR, safeNext } from "@/lib/safe-next";

/**
 * The OTP types our emails carry. The template sends `email`; `magiclink`
 * and `signup` are the older names for the same two emails. Never
 * `recovery`, `invite` or `email_change`: we send none of those, and a link
 * of that kind is not one of ours.
 */
export type AcceptedLinkType = "email" | "magiclink" | "signup";

const ACCEPTED_LINK_TYPES: ReadonlySet<string> = new Set<AcceptedLinkType>([
  "email",
  "magiclink",
  "signup",
]);

export function isAcceptedLinkType(type: unknown): type is AcceptedLinkType {
  return typeof type === "string" && ACCEPTED_LINK_TYPES.has(type);
}

/** /login/continue, carrying the link's token and a safe `next`. */
export function continuePath(tokenHash: string, type: AcceptedLinkType, next: unknown): string {
  return `/login/continue?${new URLSearchParams({ token_hash: tokenHash, type, next: safeNext(next) })}`;
}

/** /login?error=link, keeping a safe `next`: the link didn't work. */
export function loginWithLinkError(next: unknown): string {
  return `/login?${new URLSearchParams({ error: LINK_ERROR, next: safeNext(next) })}`;
}
