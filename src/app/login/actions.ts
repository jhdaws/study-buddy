"use server";

// Server actions for sign-in (US-01).
//
// TODO:
//   - signIn(): validate the email domain, then send a one-time sign-in link
//     via Supabase auth, redirecting back to /auth/confirm
//   - return a typed state object so the form can render field errors
//
// The domain restriction here is for error quality only. The authoritative
// check belongs in the database, so that calling the auth API directly
// cannot bypass it.

export {};
