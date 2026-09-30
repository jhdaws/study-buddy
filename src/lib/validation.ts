// Validation schemas shared by forms and the server actions behind them.
//
// These rules mirror the database CHECK constraints (T-C4). The database is
// the real enforcement point; this layer exists to produce a good error
// message before the round trip.
//
// C0 decided the host sets capacity and times, and the app enforces only
// sanity: end after start, start not in the past, capacity at least 2 (the
// host is one of the two). There are deliberately no maximums.

import { z } from "zod";

/**
 * How far in the past a start time may drift and still be accepted.
 *
 * Without this, a host who picks the current minute and then takes a few
 * seconds to submit gets told their session is in the past, which reads as a
 * bug rather than a rule.
 */
const START_TIME_GRACE_MS = 60_000;

/** Smallest useful session: the host plus one other person. */
export const MIN_CAPACITY = 2;

/**
 * The create-session rules (US-02).
 *
 * A factory rather than a constant because "start is not in the past" depends
 * on the current time, and a schema built once at import would freeze `now` at
 * module load. Callers build it at validation time; tests pass a fixed `now`.
 */
export function createSessionSchema(now: Date = new Date()) {
  return z
    .object({
      departmentCode: z
        .string()
        .trim()
        .min(1, "Pick a department."),
      courseNumber: z
        .string()
        .trim()
        .min(1, "Pick a course number."),
      topic: z
        .string()
        .trim()
        .min(3, "Say what you are studying, in a few words.")
        .max(120, "Keep the topic under 120 characters."),
      locationId: z
        .string()
        .trim()
        .min(1, "Pick a place to meet."),
      // Optional: C0 left room required-vs-optional open, and a library table
      // or a café has no room number to give.
      room: z
        .string()
        .trim()
        .max(60, "Keep the room under 60 characters.")
        .optional()
        .or(z.literal("")),
      startsAt: z
        .string()
        .min(1, "Pick a start time.")
        .refine(isParsableDateTime, "That start time is not a valid date."),
      endsAt: z
        .string()
        .min(1, "Pick an end time.")
        .refine(isParsableDateTime, "That end time is not a valid date."),
      capacity: z.coerce
        .number({ error: "Capacity must be a number." })
        .int("Capacity must be a whole number.")
        .min(MIN_CAPACITY, `Capacity must be at least ${MIN_CAPACITY} — that includes you.`),
    })
    .superRefine((value, ctx) => {
      const start = new Date(value.startsAt);
      const end = new Date(value.endsAt);

      // Both fields already reported their own parse failure; adding a
      // comparison error on top would just be noise.
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return;
      }

      if (start.getTime() < now.getTime() - START_TIME_GRACE_MS) {
        ctx.addIssue({
          code: "custom",
          path: ["startsAt"],
          message: "That start time has already passed.",
        });
      }

      if (end.getTime() <= start.getTime()) {
        ctx.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: "The session has to end after it starts.",
        });
      }
    });
}

export type CreateSessionInput = z.input<ReturnType<typeof createSessionSchema>>;
export type CreateSession = z.output<ReturnType<typeof createSessionSchema>>;

/** One message per field, keyed by field name, for rendering beside inputs. */
export type FieldErrors = Partial<Record<keyof CreateSessionInput, string>>;

/**
 * Collapses a Zod error into one message per field.
 *
 * Only the first issue per field survives: showing a student three complaints
 * about the same input at once is worse than showing the most important one.
 */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;

    const key = field as keyof CreateSessionInput;
    errors[key] ??= issue.message;
  }

  return errors;
}

function isParsableDateTime(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}
