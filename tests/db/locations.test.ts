import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * Who may read and write `locations` (M3, ADR 0008 rule 12): signed-in users
 * read; nobody writes through the Data API; only the server's secret key
 * (service_role) writes. Policies: supabase/migrations/*_locations_policies.sql.
 *
 * Each test runs in a transaction that is rolled back, so nothing it inserts
 * survives. The test connects as `postgres` and becomes each Supabase role
 * with `set local role` -- the role PostgREST switches to for a request with
 * that key or JWT -- and, for `authenticated`, sets the JWT claims the way
 * PostgREST does, so auth.uid() would work if a policy used it.
 *
 * A refused write shows up two ways in Postgres: an error (42501, from RLS on
 * INSERT or from a missing privilege) or, for UPDATE and DELETE under RLS
 * with no policy, zero rows affected and no error. Either is a refusal, so
 * the tests accept both -- and then check, as `postgres`, that the row really
 * is unchanged.
 */

const USER_ID = "00000000-0000-4000-8000-0000000000a3";
const PLACE_ID = "test-m3-locations-rls";
const LAT = 36.1447;
const LNG = -86.8027;

let db: Client;
let locationId: string;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
  const { rows } = await db.query<{ id: string }>(
    "insert into public.locations (place_id, lat, lng) values ($1, $2, $3) returning id",
    [PLACE_ID, LAT, LNG],
  );
  locationId = rows[0].id;
});

afterEach(async () => {
  await db.query("rollback");
});

/** Act as a Supabase role for the rest of this transaction. */
async function actAs(role: "anon" | "authenticated" | "service_role") {
  await db.query(`set local role ${role}`);
  if (role === "authenticated") {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: USER_ID, role: "authenticated" }),
    ]);
  }
}

type Attempt = { code?: string; rowCount: number | null; rows: unknown[] };

/** Run one statement without letting a failure abort the test's transaction. */
async function attempt(sql: string, params: unknown[] = []): Promise<Attempt> {
  await db.query("savepoint attempt");
  try {
    const result = await db.query(sql, params);
    await db.query("release savepoint attempt");
    return { rowCount: result.rowCount, rows: result.rows };
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    return { code: (error as { code?: string }).code, rowCount: null, rows: [] };
  }
}

function expectRefused(result: Attempt) {
  if (result.code === undefined) {
    expect(result.rowCount, "write was not refused").toBe(0);
  } else {
    expect(result.code).toBe("42501"); // insufficient_privilege, incl. RLS
  }
}

/** The test row as `postgres` sees it, whatever role the test switched to. */
async function storedRow() {
  await db.query("reset role");
  const { rows } = await db.query<{ lat: number; lng: number }>(
    "select lat, lng from public.locations where id = $1",
    [locationId],
  );
  return rows[0];
}

describe("locations: reading", () => {
  it("lets a signed-in user read a location", async () => {
    await actAs("authenticated");
    const { rows } = await db.query("select id, place_id, lat, lng from public.locations where id = $1", [
      locationId,
    ]);
    expect(rows).toEqual([{ id: locationId, place_id: PLACE_ID, lat: LAT, lng: LNG }]);
  });

  it("shows a signed-out visitor nothing", async () => {
    await actAs("anon");
    const result = await attempt("select id from public.locations where id = $1", [locationId]);
    // No policy: zero rows. (Without the default SELECT grant it would be an
    // error instead -- also nothing.)
    if (result.code !== undefined) {
      expect(result.code).toBe("42501");
    }
    expect(result.rows).toEqual([]);
  });
});

describe("locations: clients cannot write", () => {
  for (const role of ["authenticated", "anon"] as const) {
    describe(`as ${role}`, () => {
      it("cannot insert a location", async () => {
        await actAs(role);
        expectRefused(
          await attempt(
            "insert into public.locations (place_id, lat, lng) values ('test-m3-client-insert', 0, 0)",
          ),
        );
        await db.query("reset role");
        const { rows } = await db.query(
          "select 1 from public.locations where place_id = 'test-m3-client-insert'",
        );
        expect(rows).toEqual([]);
      });

      it("cannot move a location's coordinates", async () => {
        await actAs(role);
        expectRefused(
          await attempt("update public.locations set lat = 0, lng = 0 where id = $1", [locationId]),
        );
        expect(await storedRow()).toEqual({ lat: LAT, lng: LNG });
      });

      it("cannot upsert over an existing place", async () => {
        await actAs(role);
        expectRefused(
          await attempt(
            `insert into public.locations (place_id, lat, lng) values ($1, 0, 0)
             on conflict (place_id) do update set lat = excluded.lat, lng = excluded.lng`,
            [PLACE_ID],
          ),
        );
        expect(await storedRow()).toEqual({ lat: LAT, lng: LNG });
      });

      it("cannot delete a location", async () => {
        await actAs(role);
        expectRefused(await attempt("delete from public.locations where id = $1", [locationId]));
        expect(await storedRow()).toBeDefined();
      });
    });
  }
});

describe("locations: the server writes", () => {
  it("lets service_role (the secret key) upsert on place_id, keeping the row's id", async () => {
    await actAs("service_role");
    const { rows } = await db.query<{ id: string; lat: number; lng: number }>(
      `insert into public.locations (place_id, lat, lng, validated_at) values ($1, $2, $3, now())
       on conflict (place_id) do update
         set lat = excluded.lat, lng = excluded.lng, validated_at = excluded.validated_at
       returning id, lat, lng`,
      [PLACE_ID, 36.145, -86.803],
    );
    expect(rows).toEqual([{ id: locationId, lat: 36.145, lng: -86.803 }]);
  });
});
