import { NextResponse } from "next/server";

/**
 * Runs before every matched request.
 *
 * TODO: take the NextRequest and delegate to updateSession() from
 * @/lib/supabase/proxy once auth lands. Until then this is a passthrough so
 * routing behaves normally.
 */
export async function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
