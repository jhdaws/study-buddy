import "server-only";

// Structured server logs (V6, #152). Every event is ONE line of JSON, so
// Vercel's log view can search it and a script can parse it:
//
//   {"level":"error","event":"create_session_failed","message":"createSession: create_session failed",
//    "requestId":"6f1c...","at":"2026-12-01T15:00:00.000Z","reason":"session_full","code":"P0001"}
//
//   level      info | warn | error. Also decides the stream: error and warn
//              go to stderr (console.error / console.warn), info to stdout,
//              so Vercel's own level filter agrees with the line.
//   event      a snake_case name to search for. Find every line one request
//              wrote by searching its requestId instead.
//   message    one human sentence.
//   requestId  set by src/proxy.ts for every request (src/lib/request-id.ts).
//              Missing only outside a request -- a build, a test.
//   at         ISO time.
//   ...fields  a few flat extras: codes, counts, ids.
//
// WHAT NEVER GOES IN (Sprint 4, A09; the same rule as src/lib/security-log.ts):
// a password, a sign-in code, a token, an email address, a person's name or
// anything else a student typed, and Supabase's or Postgres's own error text,
// which can quote the input back. Pass a reason CODE instead:
// databaseErrorReason() and authErrorReason() in src/lib/errors.ts turn an
// error into one. As a second line of defence, formatLogLine() drops any
// field that is not a short scalar, cuts long strings and blanks anything
// shaped like an email address -- but that is a net, not a licence.
//
// Security events (failed sign-ins, refused actions) have their own module,
// src/lib/security-log.ts, which writes through formatLogLine() too, so its
// lines carry a level and the request ID as well.

import { headers } from "next/headers";

import { databaseErrorReason, type DatabaseErrorLike } from "@/lib/errors";
import { isRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

export type LogLevel = "info" | "warn" | "error";

/** Extra fields on a line. Only short, flat values; see the header comment. */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

/** Keys every line has, which a field can never overwrite. */
const RESERVED = new Set(["level", "event", "message", "requestId", "at"]);

const EVENT_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const EMAIL = /[^\s@"]+@[^\s@"]+/g;
const MAX_STRING = 200;

/** A string field, made safe: emails blanked, newlines gone, length capped. */
function clean(value: string): string {
  const text = value.replace(EMAIL, "[email]").replace(/[\r\n]+/g, " ");
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
}

/**
 * One log line, as the JSON text that gets written. Pure: the time and the
 * request id are arguments, so tests can pin them.
 */
export function formatLogLine(
  level: LogLevel,
  event: string,
  message: string,
  fields: LogFields = {},
  { requestId, now = new Date() }: { requestId?: string | null; now?: Date } = {},
): string {
  const line: Record<string, string | number | boolean | null> = {
    level,
    event: EVENT_NAME.test(event) ? event : "invalid_event",
    message: clean(message),
  };
  if (isRequestId(requestId)) line.requestId = requestId;
  line.at = now.toISOString();

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || RESERVED.has(key) || !FIELD_NAME.test(key)) continue;
    if (typeof value === "string") line[key] = clean(value);
    else if (typeof value === "number") line[key] = Number.isFinite(value) ? value : null;
    else if (typeof value === "boolean" || value === null) line[key] = value;
  }
  return JSON.stringify(line);
}

/** Writes a finished line to the stream its level belongs to. */
export function writeLogLine(level: LogLevel, line: string): void {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * This request's id, from the header the proxy set. Null outside a request:
 * headers() throws there, and a log call must never throw.
 */
export async function currentRequestId(): Promise<string | null> {
  try {
    const id = (await headers()).get(REQUEST_ID_HEADER);
    return isRequestId(id) ? id : null;
  } catch {
    return null;
  }
}

async function write(level: LogLevel, event: string, message: string, fields?: LogFields) {
  try {
    const requestId = await currentRequestId();
    writeLogLine(level, formatLogLine(level, event, message, fields, { requestId }));
  } catch {
    // Logging must never break the request it is describing.
  }
}

/**
 * The server logger. Await it (it reads the request ID first); it never
 * throws.
 *
 *   await log.error("join_session_failed", "joinSession: join_session failed", {
 *     reason: databaseErrorReason(error),
 *     code: error.code,
 *   });
 */
export const log = {
  info: (event: string, message: string, fields?: LogFields) => write("info", event, message, fields),
  warn: (event: string, message: string, fields?: LogFields) => write("warn", event, message, fields),
  error: (event: string, message: string, fields?: LogFields) => write("error", event, message, fields),
};

/**
 * The fields to log for a failed Supabase/Postgres call: the name the error
 * was mapped by (databaseErrorReason) and its SQLSTATE -- never its text.
 */
export function databaseErrorFields(error: DatabaseErrorLike): LogFields {
  return { reason: databaseErrorReason(error), code: error.code };
}
