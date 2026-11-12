"use server";

// Server actions for blocking and unblocking a student (US-22). Owner: P4.
//
// Both are plain own-row writes through RLS (*_p4_us_22_block_a_user.sql),
// not an RPC: `blocker_id` comes from the INSERT's own default (auth.uid()),
// and clients have no privilege to name it, so a block can never be filed as
// someone else. The checks here are for a good message; the database (the
// blocks_not_self CHECK, and RLS refusing a row where you are not the
// blocker) is the enforcement.
//
// Bind the blocked student's id, the same pattern joinSession()/leaveSession()
// use for a session id: `useActionState(blockUser.bind(null, userId), {})`.

import { revalidatePath } from "next/cache";

import { databaseErrorMessage } from "@/lib/errors";
import { createClient, requireUser } from "@/lib/supabase/server";

export type BlockActionState = { error?: string };

/** Block `blockedUserId`. Refused by the database if it is the caller's own id. */
export async function blockUser(
  blockedUserId: string,
  _prev: BlockActionState,
  _formData: FormData,
): Promise<BlockActionState> {
  const user = await requireUser();
  if (blockedUserId === user.id) {
    return { error: "You can't block yourself." };
  }

  const supabase = await createClient();
  // No .select(): nothing about the new row needs to come back, and
  // students have no SELECT privilege on a row they are not the blocker of
  // anyway -- irrelevant here since they always are, but asking for one back
  // is a habit worth not forming.
  const { error } = await supabase.from("blocks").insert({ blocked_id: blockedUserId });
  if (error) {
    console.error("blockUser: insert failed", { code: error.code, message: error.message });
    return { error: databaseErrorMessage(error) };
  }

  revalidatePath("/sessions", "layout");
  revalidatePath("/profile");
  return {};
}

/** Undo a block. Never errors if the row is already gone -- unblocking twice is harmless. */
export async function unblockUser(
  blockedUserId: string,
  _prev: BlockActionState,
  _formData: FormData,
): Promise<BlockActionState> {
  const user = await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedUserId);
  if (error) {
    console.error("unblockUser: delete failed", { code: error.code, message: error.message });
    return { error: databaseErrorMessage(error) };
  }

  revalidatePath("/sessions", "layout");
  revalidatePath("/profile");
  return {};
}
