import type { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * The form's sanity limits, enforced by the database too
 * (supabase/migrations/*_session_text_limits.sql), and the anon revoke on
 * the two RPCs. Each test runs in a transaction that is rolled back, so
 * nothing it writes reaches seed.test.ts's exact-department-list check.
 */

const open: Client[] = [];

afterEach(async () => {
  await Promise.all(
    open.splice(0).map(async (client) => {
      await client.query("rollback").catch(() => undefined);
      await client.end();
    }),
  );
});

/** A connection inside a transaction, signed in as a named host. */
async function asHost(): Promise<Client> {
  const db = await connect();
  open.push(db);
  await db.query("begin");
  const userId = await createUser(db, { displayName: "Limit Tester" });
  await signInAs(db, userId);
  return db;
}

/** create_session with valid arguments, `overrides` applied. Run as the caller. */
async function createSession(db: Client, overrides: Record<string, unknown> = {}) {
  const course = await db.query<{ id: string }>(
    "select public.get_or_create_course('CS', '3251') as id",
  );
  // The caller cannot write locations (M3), so borrow the server's role for
  // the one row the session needs, then become the caller again.
  await db.query("reset role");
  const location = await db.query<{ id: string }>(`
    insert into public.locations (place_id, lat, lng)
    values ('ChIJ-test-text-limits', 36.1447, -86.8027)
    on conflict (place_id) do update set lat = excluded.lat
    returning id
  `);
  await db.query("set role authenticated");

  const args = {
    location_label: "Featheringill Hall",
    room: "134",
    topic: "Sprint 2 review",
    ...overrides,
  };
  return db.query(
    `select id from public.create_session(
       $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
       now() + interval '1 hour', now() + interval '2 hours', 4
     )`,
    [course.rows[0].id, location.rows[0].id, args.location_label, args.room, args.topic],
  );
}

describe("sessions: text limits (mirror src/lib/limits.ts)", () => {
  it("accepts the longest topic, label and room the form allows", async () => {
    const db = await asHost();
    const result = await createSession(db, {
      topic: "t".repeat(120),
      location_label: "l".repeat(100),
      room: "r".repeat(50),
    });
    expect(result.rows).toHaveLength(1);
  });

  it.each([
    ["a blank topic", { topic: "   " }, "sessions_topic_length"],
    ["a 121-character topic", { topic: "t".repeat(121) }, "sessions_topic_length"],
    ["a blank location label", { location_label: "  " }, "sessions_location_label_length"],
    ["a 101-character label", { location_label: "l".repeat(101) }, "sessions_location_label_length"],
    ["a 51-character room", { room: "r".repeat(51) }, "sessions_room_length"],
  ])("refuses %s from a direct RPC call", async (_label, overrides, constraint) => {
    const db = await asHost();
    await expect(createSession(db, overrides)).rejects.toThrow(constraint);
  });
});

describe("departments: code length", () => {
  it("refuses an 11-character code through the INSERT policy", async () => {
    const db = await asHost();
    await expect(
      db.query(
        "insert into public.departments (code, created_by) values ($1, auth.uid())",
        ["ABCDEFGHIJK"],
      ),
    ).rejects.toThrow("departments_code_length");
  });
});

describe("RPCs: signed-out callers have no EXECUTE", () => {
  it.each([
    "public.create_session(uuid, uuid, text, text, text, timestamptz, timestamptz, integer)",
    "public.get_or_create_course(text, text)",
  ])("anon cannot execute %s", async (signature) => {
    const db = await connect();
    open.push(db);
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated`,
      [signature],
    );
    expect(rows[0]).toEqual({ anon: false, authenticated: true });
  });
});
