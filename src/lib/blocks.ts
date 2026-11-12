// Reading who the signed-in student has blocked (US-22). Owner: P4.
//
// SERVER ONLY, like sessions.ts and profiles.ts: reads go through the
// cookie-bound client, so RLS applies as the signed-in student
// (*_p4_us_22_block_a_user.sql). A signed-out caller's query is refused by
// the grant entirely (revoke all ... from anon), which both functions below
// treat the same as "no blocks" -- a courtesy filter is never a reason to
// break a page.
//
// Writing a block or an unblock is a plain own-row insert/delete through
// blockUser()/unblockUser() (src/app/blocks/actions.ts); there is no
// SECURITY DEFINER function for it, the same reasoning profile_courses and
// study_requests already give for why a function would buy nothing here.

import "server-only";

import { createClient } from "@/lib/supabase/server";

/** One row of the "Blocked students" list on /profile. */
export type BlockedUser = {
  userId: string;
  /** Null for a student who deleted their account, or never set a name. */
  displayName: string | null;
};

/**
 * The ids of every student the signed-in viewer has blocked. Used to filter
 * listSessions() and listStudyRequests() -- never exposed to the browser as
 * a bare list of ids, only as the filtered result.
 */
export async function listBlockedUserIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("blocks").select("blocked_id");
  if (error) return [];
  return (data ?? []).map((row) => row.blocked_id);
}

/** The viewer's blocks, each with the blocked student's name, for /profile. */
export async function listMyBlocks(): Promise<BlockedUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, profiles!blocks_blocked_id_fkey (display_name)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load your blocked students: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    userId: row.blocked_id,
    displayName: row.profiles?.display_name ?? null,
  }));
}
