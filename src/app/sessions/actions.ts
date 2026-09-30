"use server";

// Server actions for study sessions.
//
// Only createSession() exists, and it writes to the in-memory demo store
// (src/lib/demo-store.ts) rather than a database. T-E2 repoints it once T-C4
// creates the tables; the validation below is already the shape it needs.
//
// TODO (later sprints):
//   - joinSession()    US-04  take a seat
//   - leaveSession()   US-08  give up a seat
//   - cancelSession()  US-09  host only
//   - sendMessage()    US-05  post to the session chat
//
// IMPORTANT: joining must not be a plain insert. The capacity check and the
// insert have to happen atomically, or two students can take the same last
// seat. Route it through a database function that holds a lock across both
// steps (T-C5).
//
// Also missing until sign-in lands (T-E1): there is no host. A real
// createSession() reads the signed-in user server-side and refuses without
// one — the client never supplies a host id.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { addSession } from "@/lib/demo-store";
import {
  createSessionSchema,
  fieldErrors,
  type FieldErrors,
} from "@/lib/validation";

export type CreateSessionState = { errors: FieldErrors };

/**
 * Validates and records a new session, then sends the host to the list.
 *
 * Re-validates with the same schema the form used: a client check is a
 * convenience, never the enforcement point (see CLAUDE.md).
 */
export async function createSession(
  input: unknown,
): Promise<CreateSessionState> {
  const result = createSessionSchema().safeParse(input);

  if (!result.success) {
    return { errors: fieldErrors(result.error) };
  }

  const session = addSession(result.data);

  revalidatePath("/sessions");
  redirect(`/sessions?created=${session.id}`);
}
