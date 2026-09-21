// Session refresh + route protection, called from src/proxy.ts.
//
// TODO: implement alongside the auth push.
//   - refresh the Supabase auth token on every matched request
//   - redirect signed-out users away from private routes, preserving the
//     path they wanted in a ?next= param
//   - the response returned here MUST be the one carrying the refreshed
//     cookies; building a fresh NextResponse instead silently drops them
//     and logs the user out on the next navigation

export {};
