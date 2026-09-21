// Magic-link landing route.
//
// TODO:
//   - read token_hash and type from the query string
//   - exchange them for a session cookie via supabase.auth.verifyOtp()
//   - redirect onward to ?next=, or /sessions by default
//
// SECURITY: only ever redirect to a path on this origin. Accepting an
// absolute URL from the query string would make this an open redirect.

export {};
