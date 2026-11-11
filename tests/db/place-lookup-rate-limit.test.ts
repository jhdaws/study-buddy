import type { Client, DatabaseError } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { PLACE_LOOKUP_WINDOW_MINUTES, PLACE_LOOKUPS_PER_WINDOW } from "../../src/lib/limits";
import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * SEC-05 (threat model T8) -- consume_rate_limit() and the `place_lookup`
 * bucket (supabase/migrations/*_place_lookup_rate_limit.sql). createSession()
 * calls it before every resolvePlace(); src/app/sessions/actions.test.ts checks
 * that a refusal stops the lookup. Every test uses fresh students, so counts
 * start at zero although rows commit.
 */

const open: Client[] = [];

async function connection(): Promise<Client> {
  const client = await connect();
  open.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((client) => client.end()));
});

/** A new student, and a connection signed in as them. */
async function student(): Promise<{ id: string; db: Client }> {
  const id = await createUser(await connection(), { displayName: "Rate Tester" });
  const db = await connection();
  await signInAs(db, id);
  return { id, db };
}

async function consume(db: Client, bucket = "place_lookup"): Promise<number> {
  const { rows } = await db.query<{ left: number }>(
    "select public.consume_rate_limit($1) as left",
    [bucket],
  );
  return rows[0].left;
}

async function useUp(db: Client): Promise<void> {
  for (let i = 0; i < PLACE_LOOKUPS_PER_WINDOW; i++) await consume(db);
}

async function refusal(promise: Promise<unknown>): Promise<DatabaseError> {
  const error = await promise.then(
    () => null,
    (reason: DatabaseError) => reason,
  );
  expect(error, "expected consume_rate_limit to refuse").not.toBeNull();
  return error as DatabaseError;
}

/** Ages `count` of a student's hits (oldest first) past the window, as an admin. */
async function age(userId: string, count: number): Promise<void> {
  const admin = await connection();
  await admin.query(
    `update private.rate_limit_hits set hit_at = now() - $3::interval
     where ctid in (select ctid from private.rate_limit_hits
                    where user_id = $1 order by hit_at limit $2)`,
    [userId, count, `${PLACE_LOOKUP_WINDOW_MINUTES} minutes 1 second`],
  );
}

async function hitCount(userId: string): Promise<number> {
  const admin = await connection();
  const { rows } = await admin.query<{ n: number }>(
    "select count(*)::int as n from private.rate_limit_hits where user_id = $1",
    [userId],
  );
  return rows[0].n;
}

describe("consume_rate_limit('place_lookup') (SEC-05)", () => {
  it("holds the same limit as src/lib/limits.ts", async () => {
    const admin = await connection();
    const { rows } = await admin.query(
      "select max_hits, window_seconds from private.rate_limit_rules where bucket = 'place_lookup'",
    );
    expect(rows).toEqual([
      { max_hits: PLACE_LOOKUPS_PER_WINDOW, window_seconds: PLACE_LOOKUP_WINDOW_MINUTES * 60 },
    ]);
  });

  it(`allows ${PLACE_LOOKUPS_PER_WINDOW} lookups, counting down, then refuses with place_lookup_rate_limited`, async () => {
    const { id, db } = await student();
    const left: number[] = [];
    for (let i = 0; i < PLACE_LOOKUPS_PER_WINDOW; i++) left.push(await consume(db));
    expect(left[0]).toBe(PLACE_LOOKUPS_PER_WINDOW - 1);
    expect(left.at(-1)).toBe(0);

    const error = await refusal(consume(db));
    expect(error.message).toBe("place_lookup_rate_limited");
    expect(error.code).toBe("PT429"); // PostgREST answers HTTP 429

    // A refusal spends nothing: the hits are the student's, and only the allowed ones.
    expect(await hitCount(id)).toBe(PLACE_LOOKUPS_PER_WINDOW);
  });

  it("counts each student separately", async () => {
    const first = await student();
    await useUp(first.db);
    await refusal(consume(first.db));

    const second = await student();
    expect(await consume(second.db)).toBe(PLACE_LOOKUPS_PER_WINDOW - 1);
  });

  it("is a rolling window: each hit frees its slot as it ages out", async () => {
    const { id, db } = await student();
    await useUp(db);

    await age(id, 1);
    expect(await consume(db)).toBe(0);
    await refusal(consume(db));

    await age(id, PLACE_LOOKUPS_PER_WINDOW);
    expect(await consume(db)).toBe(PLACE_LOOKUPS_PER_WINDOW - 1);
    // Expired hits are deleted on the way, so the table never grows past the limit.
    expect(await hitCount(id)).toBe(1);
  });

  it("refuses a bucket with no rule, and records nothing for it", async () => {
    const { id, db } = await student();
    const error = await refusal(consume(db, "made_up_bucket"));
    expect(error.message).toBe("unknown_rate_limit");
    expect(await hitCount(id)).toBe(0);
  });

  it("lets only one of two simultaneous calls take the last hit", async () => {
    const { id, db: a } = await student();
    for (let i = 1; i < PLACE_LOOKUPS_PER_WINDOW; i++) await consume(a);

    const b = await connection();
    await signInAs(b, id);
    const bPid = (await b.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;

    // A takes the last hit and holds its transaction open; B must wait for it.
    await a.query("begin");
    await consume(a);
    await b.query("begin");
    const bCall = refusal(consume(b));

    const watcher = await connection();
    await expect
      .poll(async () => {
        const { rows } = await watcher.query<{ n: number }>(
          `select count(*)::int as n from pg_locks
           where pid = $1 and locktype = 'advisory' and not granted`,
          [bPid],
        );
        return rows[0].n;
      })
      .toBe(1);

    await a.query("commit");
    expect((await bCall).message).toBe("place_lookup_rate_limited");
    await b.query("rollback");
    expect(await hitCount(id)).toBe(PLACE_LOOKUPS_PER_WINDOW);
  });
});

describe("consume_rate_limit: who may call it, and the counters (SEC-05)", () => {
  it("refuses a connection with no signed-in user", async () => {
    const db = await connection();
    const error = await refusal(consume(db));
    expect(error.message).toBe("not_signed_in");
  });

  it("cannot be executed by anon at all (BUG-08)", async () => {
    const db = await connection();
    await db.query("set role anon");
    const error = await refusal(consume(db));
    expect(error.message).toMatch(/permission denied for function consume_rate_limit/);
  });

  it("gives a signed-in student no way to read, reset or raise the counters directly", async () => {
    const { id, db } = await student();
    await consume(db);

    for (const sql of [
      "select * from private.rate_limit_hits",
      "delete from private.rate_limit_hits",
      "update private.rate_limit_rules set max_hits = 1000000",
    ]) {
      const error = await refusal(db.query(sql));
      expect(error.message).toMatch(/permission denied for schema private/);
    }
    expect(await hitCount(id)).toBe(1);
  });
});
