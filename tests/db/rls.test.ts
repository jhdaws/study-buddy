import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * Permanent guard: nothing in `public` may be reachable without Row Level
 * Security. Not a placeholder -- keep it.
 *
 * Every table in `public` is exposed through Supabase's Data API, and the
 * browser talks to it directly (docs/architecture.md §1). A table without RLS
 * is readable and writable by any client, whatever our server code checks.
 * RLS enabled with no policy denies everything, which is the safe failure
 * direction (ADR 0008), so the rule is simply: enable it at creation.
 *
 * This checks that RLS is ON. It cannot check that a policy is RIGHT --
 * each track tests its own policies. Nor does it check views: a view runs
 * with its owner's rights, bypassing the RLS of the tables it reads, unless
 * it is created `with (security_invoker = true)`.
 */

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

describe("row level security", () => {
  it("is enabled on every table in the public schema", async () => {
    // relkind 'r' = ordinary table, 'p' = partitioned table.
    const { rows } = await db.query<{ name: string; rls: boolean }>(`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
      order by c.relname
    `);

    // A query that matched nothing would pass the real assertion vacuously.
    expect(rows.length, "no tables found in public -- is the schema applied?")
      .toBeGreaterThan(0);

    const withoutRls = rows.filter((row) => !row.rls).map((row) => row.name);
    expect(withoutRls, "tables in public without RLS enabled").toEqual([]);
  });
});
