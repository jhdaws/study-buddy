import type { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * Proves the database test harness works, before there is a schema to test.
 *
 * The second case is the shape of US-07b with the schema taken out: two
 * independent connections, one holding a lock, the other blocked until the
 * first commits. When the join function exists, US-07b replaces the advisory
 * lock with two real join calls. Delete this file then.
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

describe("database test harness", () => {
  it("reaches the local database", async () => {
    const db = await connection();
    const { rows } = await db.query<{ ok: number }>("select 1 as ok");
    expect(rows[0].ok).toBe(1);
  });

  it("can make one connection wait on another's transaction", async () => {
    const a = await connection();
    const b = await connection();
    const LOCK = 4278;

    await a.query("begin");
    await a.query("select pg_advisory_xact_lock($1)", [LOCK]);

    await b.query("begin");
    let bAcquired = false;
    const bLock = b
      .query("select pg_advisory_xact_lock($1)", [LOCK])
      .then(() => {
        bAcquired = true;
      });

    // B must still be waiting while A holds the lock.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(bAcquired).toBe(false);

    // Releasing A's lock lets B through.
    await a.query("commit");
    await bLock;
    expect(bAcquired).toBe(true);
    await b.query("commit");
  });
});
