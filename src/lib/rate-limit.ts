// Per-student rate limits (SEC-05), enforced in the database.
//
// consume_rate_limit() (supabase/migrations/*_place_lookup_rate_limit.sql)
// counts by auth.uid() -- the student's own JWT, from the session cookie --
// and reads each bucket's limit from private.rate_limit_rules. It takes no
// user id and no limit from us, so there is nothing here to get wrong but the
// bucket's name.
//
// Its own module, not inline in the action, so actions.test.ts can replace
// it without changing what the other RPCs see.

import type { DatabaseErrorLike } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** The buckets private.rate_limit_rules defines. Add a rule, then a name. */
export type RateLimitBucket = "place_lookup";

/**
 * Spends one of the signed-in student's hits in `bucket`. Resolves to null if
 * allowed; otherwise to the database's error -- `place_lookup_rate_limited`
 * (PT429) at the limit, or whatever else stopped the check.
 *
 * Treat ANY error as a refusal. This guards billed calls, so it fails closed:
 * a check that could not run is not a check that passed.
 */
export async function consumeRateLimit(
  bucket: RateLimitBucket,
): Promise<DatabaseErrorLike | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("consume_rate_limit", { p_bucket: bucket });
  return error;
}
