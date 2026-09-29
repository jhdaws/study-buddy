// GET /api/courses?department=CS&q=32 -- course typeahead (US-02).
// Owner: Track S -- S4 (#21) owns searchCourses(); this handler only adapts
// it to HTTP and should not need to change when the real body lands.
//
// Response: 200 with a JSON array of CourseSuggestion (src/lib/sessions.ts),
// most used first; 400 with { error } when `department` is missing. Client
// components call it through fetchCourseSuggestions() in
// src/lib/course-search.ts, never with a hand-built fetch.
//
// WHY A ROUTE HANDLER AND NOT A SERVER FUNCTION (W4 decision, #11). A
// typeahead is a read fired on nearly every keystroke. The Next 16 docs say
// Server Functions are "designed for server-side mutations" and that "the
// client currently dispatches and awaits them one at a time"; the
// backend-for-frontend guide adds that using Server Actions for data fetching
// "introduces sequential execution" (node_modules/next/dist/docs/01-app/
// 01-getting-started/07-mutating-data.md and 02-guides/backend-for-frontend.md).
// So each keystroke's lookup would queue behind the previous one -- and behind
// a createSession submit. A GET Route Handler runs concurrently, can be
// cancelled with an AbortController when the next keystroke arrives, and is
// a plain URL to test with curl. The cost is losing end-to-end types over the
// wire; fetchCourseSuggestions() puts them back.
//
// Auth: none in the stub. The real searchCourses() reads through the
// cookie-bound Supabase client, so RLS decides what a caller sees -- signed
// out, that is nothing (S2 adds the read policy). If A4 wants signed-out
// callers to get a 401 instead of [], check getCurrentUser() here. Do NOT make
// the proxy redirect /api/* to /login: fetch() follows redirects and would
// hand the typeahead an HTML page.

import type { NextRequest } from "next/server";

import { searchCourses } from "@/lib/sessions";

// Longer than any real code or number; stops a pasted essay reaching the
// database.
const MAX_PARAM_LENGTH = 50;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const department = (params.get("department") ?? "").trim().slice(0, MAX_PARAM_LENGTH);
  const query = (params.get("q") ?? "").trim().slice(0, MAX_PARAM_LENGTH);

  if (!department) {
    return Response.json({ error: "department is required" }, { status: 400 });
  }

  return Response.json(await searchCourses(department, query));
}
