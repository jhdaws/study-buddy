// The request ID (V6, #152): one random id per request, so every log line a
// request writes can be found together in Vercel's log view.
//
// src/proxy.ts makes a fresh one for every request it sees and puts it
//   - on the REQUEST, in REQUEST_ID_HEADER, where the logger reads it back
//     with headers() (src/lib/log.ts), and
//   - on the RESPONSE, under the same name, so a student or a teammate can
//     quote it from the browser's network tab when something went wrong.
// It always overwrites whatever the client sent: a forged id could be used
// to make one request's lines look like another's.
//
// No "server-only" here: the proxy imports it, and it holds nothing secret.

/** Request and response header carrying the id. */
export const REQUEST_ID_HEADER = "x-request-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A new request id: a random UUID. */
export function createRequestId(): string {
  return crypto.randomUUID();
}

/** True for an id createRequestId() could have made. */
export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
