// Supabase client for Server Components, Server Actions and Route Handlers.
//
// TODO: implement alongside the database push.
//   - createServerClient() from "@supabase/ssr", wired to next/headers cookies
//   - must be created per-request: it closes over that request's cookies
//   - export a getCurrentUser() helper that calls auth.getUser(), NOT
//     getSession() -- session cookies are attacker-supplied input and
//     getUser() revalidates the token with Supabase

export {};
