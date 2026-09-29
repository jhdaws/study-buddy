// Magic-link landing route. Owner: Track A -- A3 (#16); the hosted Supabase
// email template must point here (A1, #14).
//
// TODO:
//   - read token_hash and type from the query string
//   - exchange them for a session cookie via supabase.auth.verifyOtp()
//   - redirect onward to ?next=, or /sessions by default
//
// SECURITY: only ever redirect to a path on this origin. Accepting an
// absolute URL from the query string would make this an open redirect.

export {};
