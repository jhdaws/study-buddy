import type { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * V5 (#151) -- public.health_check(), the database round trip behind
 * /api/health (supabase/migrations/*_health_check.sql). The route's own logic
 * is unit tested in src/app/api/health/route.test.ts; this checks what only
 * Postgres can: that a signed-out caller may run it, and that running it
 * gives that caller nothing else.
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

describe("health_check() (V5)", () => {
  it("returns true for a signed-out caller, as /api/health is", async () => {
    const anon = await connection();
    await anon.query("set role anon");

    const { rows } = await anon.query<{ ok: boolean }>("select public.health_check() as ok");

    expect(rows).toEqual([{ ok: true }]);
  });

  it("is SECURITY INVOKER, STABLE, with an empty search_path, and only anon and authenticated may run it", async () => {
    const admin = await connection();
    const { rows } = await admin.query(`
      select p.prosecdef as definer,
             p.provolatile as volatility,
             p.proconfig as config,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authed,
             exists (
               select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'
             ) as public_execute
        from pg_proc p
       where p.oid = 'public.health_check()'::regprocedure
    `);

    expect(rows).toEqual([
      {
        definer: false,
        volatility: "s",
        config: ["search_path=\"\""],
        anon: true,
        authed: true,
        public_execute: false,
      },
    ]);
  });

  it("gives a signed-out caller no new reach: the tables stay closed to anon", async () => {
    const anon = await connection();
    await anon.query("set role anon");
    await anon.query("select public.health_check()");

    const refused = await anon.query("select 1 from public.sessions limit 1").then(
      () => null,
      (error: { code?: string }) => error.code,
    );

    expect(refused).toBe("42501");
  });
});
