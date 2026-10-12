import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every matched request: refreshes the Supabase session cookie
 * and sends signed-out visitors from /sessions* to /login?next=... (A4).
 * The logic, and the rules for not losing cookies, are in
 * @/lib/supabase/proxy.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
