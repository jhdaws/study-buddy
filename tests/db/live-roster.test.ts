import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * Live roster (S6 follow-up, migration 20261026022048_live_roster.sql):
 * session_attendees streams through Supabase Realtime.
 *
 * Realtime itself is not running in CI's db job, so this checks the
 * database's half -- the publication and the grants -- not delivery.
 * Delivery, and what a signed-out listener receives, were checked against a
 * full local stack when the migration was written (docs/test-cases.md).
 */

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

describe("live roster publication", () => {
  it("publishes exactly the public tables chosen for Realtime", async () => {
    // An allowlist on purpose. Publishing a table streams its rows to every
    // browser whose RLS lets them read it -- and DELETEs to every browser,
    // since Realtime does not apply RLS to them. Adding a table here (US-05's
    // messages, say) should be a decision someone writes down, not a side
    // effect.
    const { rows } = await db.query<{ tablename: string }>(`
      select tablename
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
      order by tablename
    `);

    expect(rows.map((row) => row.tablename)).toEqual(["session_attendees"]);
  });

  it("keeps session_attendees' default replica identity, so a DELETE carries session_id", async () => {
    // 'd' = default: the primary key, (session_id, user_id). The client
    // matches a leave to its session on old.session_id (src/lib/live-roster.ts).
    const { rows } = await db.query<{ identity: string; key: string[] }>(`
      select c.relreplident as identity,
             array(
               select a.attname::text
               from pg_index i
               join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
               where i.indrelid = c.oid and i.indisprimary
               order by a.attname
             ) as key
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'session_attendees'
    `);

    expect(rows).toEqual([{ identity: "d", key: ["session_id", "user_id"] }]);
  });

  it("gives signed-out (anon) clients no privilege on session_attendees", async () => {
    // RLS is not applied to Realtime DELETE events, so this grant is what
    // keeps a signed-out listener from receiving every leave's ids.
    const { rows } = await db.query<{ privilege: string }>(`
      select privilege_type as privilege
      from information_schema.role_table_grants
      where grantee = 'anon'
        and table_schema = 'public'
        and table_name = 'session_attendees'
    `);
    expect(rows).toEqual([]);

    const anon = await connect();
    try {
      await anon.query("set role anon");
      await expect(anon.query("select session_id from public.session_attendees")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await anon.end();
    }
  });
});
