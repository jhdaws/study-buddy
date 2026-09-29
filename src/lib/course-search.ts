// The client side of the course typeahead: a typed wrapper around
// GET /api/courses (src/app/api/courses/route.ts), which calls
// searchCourses() in src/lib/sessions.ts. Why a Route Handler rather than a
// Server Function is recorded in that route file.
//
// Client-safe: W5's typeahead (a Client Component) imports this. The type
// import below is erased at build time, so the server-only module it names
// never reaches the browser.
//
// Owner: Track W (W4, #11). Nothing here is a stub -- it works against the
// stub and the real searchCourses() alike.

import type { CourseSuggestion } from "@/lib/sessions";

export const COURSE_SEARCH_PATH = "/api/courses";

/**
 * Course suggestions for a department and a partial number, most used first.
 *
 * Returns `[]` without a request when `departmentCode` is blank. Throws on a
 * non-2xx response. Pass an AbortSignal and abort it when the next keystroke
 * arrives, so a slow response for `3` cannot overwrite the one for `32`; an
 * aborted call rejects with a DOMException named "AbortError" -- ignore it.
 */
export async function fetchCourseSuggestions(
  departmentCode: string,
  query: string,
  options: { signal?: AbortSignal } = {},
): Promise<CourseSuggestion[]> {
  if (!departmentCode.trim()) return [];

  const params = new URLSearchParams({ department: departmentCode, q: query });
  const response = await fetch(`${COURSE_SEARCH_PATH}?${params}`, {
    headers: { accept: "application/json" },
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Course search failed with HTTP ${response.status}`);
  }
  return (await response.json()) as CourseSuggestion[];
}
