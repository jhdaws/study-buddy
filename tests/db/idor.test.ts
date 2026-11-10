import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createUser } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * OWASP A01 (Broken Access Control): IDOR as a second user. Sprint 4 Part 2c,
 * docs/security/threat-model.md section 4, threats T3 and T4.
 *
 * Alice hosts a session and Carol has joined it. Mallory is another signed-in
 * Vanderbilt student. She knows both their ids, because every signed-in user
 * can read `profiles.id` and `session_attendees.user_id`. She tries to act on
 * their rows directly, as she could through PostgREST with her own JWT and
 * the public anon key, never through our forms. Every attempt must be refused,
 * and the rows must be unchanged afterwards.
 *
 * Other files test some of these rules one at a time (profiles.test.ts,
 * join-leave-session.test.ts). This file is the A01 checklist in one place,
 * plus the variants an attacker would try next.
 *
 * Each test runs in a transaction that is rolled back, so nothing is left in
 * the local database.
 */

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

type Attempt = { error?: DatabaseError; rowCount: number | null; rows: Record<string, unknown>[] };

/**
 * Run a statement that may fail without aborting the test's transaction. A
 * savepoint is rolled back on error, and the error is returned, not thrown.
 */
async function attempt(sql: string, params: unknown[] = []): Promise<Attempt> {
  await db.query("savepoint attempt");
  try {
    const result = await db.query(sql, params);
    await db.query("release savepoint attempt");
    return { rowCount: result.rowCount, rows: result.rows };
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    return { error: error as DatabaseError, rowCount: null, rows: [] };
  }
}

/**
 * Run `fn` as the Data API would for this user: their JWT claims, and the
 * `authenticated` role. Pass null to run as a signed-out visitor (`anon`).
 */
async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  const role = userId ? "authenticated" : "anon";
  const claims = userId ? { sub: userId, role } : { role };
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  try {
    return await fn();
  } finally {
    await db.query("reset role");
  }
}

let alice: string;
let carol: string;
let mallory: string;
let sessionId: string;

/** The roster of the shared session, read with the database's own rights. */
async function roster(): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    "select user_id from public.session_attendees where session_id = $1 order by user_id",
    [sessionId],
  );
  return rows.map((row) => row.user_id);
}

beforeEach(async () => {
  await db.query("begin");

  alice = await createUser(db, { displayName: "Alice" });
  carol = await createUser(db, { displayName: "Carol" });
  mallory = await createUser(db, { displayName: "Mallory" });

  // The catalogue rows a session needs, as the server would leave them.
  await db.query(
    "insert into public.departments (code) values ('CS') on conflict (code) do nothing",
  );
  const course = await db.query<{ id: string }>(`
    insert into public.courses (department_code, number, title)
    values ('CS', '4278', 'Principles of Software Engineering')
    on conflict (department_code, number) do update set title = excluded.title
    returning id
  `);
  const location = await db.query<{ id: string }>(`
    insert into public.locations (place_id, lat, lng)
    values ('ChIJ-test-idor-featheringill', 36.1447, -86.8027)
    on conflict (place_id) do update set lat = excluded.lat
    returning id
  `);

  // Alice hosts through the real function; Carol joins through the real one.
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  sessionId = await as(alice, async () => {
    const { rows } = await db.query<{ id: string }>(
      `select (public.create_session(
         $1::uuid, $2::uuid, 'Featheringill Hall', '134', 'IDOR review',
         $3::timestamptz, $4::timestamptz, 4
       )).id`,
      [course.rows[0].id, location.rows[0].id, startsAt, endsAt],
    );
    return rows[0].id;
  });
  await as(carol, () => db.query("select public.join_session($1)", [sessionId]));

  expect(await roster()).toEqual([alice, carol].sort());
});

afterEach(async () => {
  await db.query("rollback");
});

describe("A01 IDOR: another signed-in student cannot act on someone else's rows", () => {
  it("cannot update someone else's profile", async () => {
    const update = await as(mallory, () =>
      attempt("update public.profiles set display_name = 'Hijacked' where id = $1", [alice]),
    );
    // RLS hides Alice's row from the update: no error, and nothing changes.
    expect(update.error).toBeUndefined();
    expect(update.rowCount).toBe(0);

    // An upsert is an INSERT first, and clients have no INSERT on profiles.
    const upsert = await as(mallory, () =>
      attempt(
        `insert into public.profiles (id, display_name) values ($1, 'Hijacked')
         on conflict (id) do update set display_name = excluded.display_name`,
        [alice],
      ),
    );
    expect(upsert.error?.code).toBe("42501");

    const { rows } = await db.query("select display_name from public.profiles where id = $1", [
      alice,
    ]);
    expect(rows).toEqual([{ display_name: "Alice" }]);
  });

  it("cannot insert into session_attendees directly, or move or remove anyone's seat", async () => {
    // Seat herself without join_session(), which would check the seat limit
    // under a row lock (US-07b).
    const self = await as(mallory, () =>
      attempt("insert into public.session_attendees (session_id, user_id) values ($1, $2)", [
        sessionId,
        mallory,
      ]),
    );
    expect(self.error?.code).toBe("42501");

    // Seat someone else who never asked to join.
    const dave = await createUser(db, { displayName: "Dave" });
    const other = await as(mallory, () =>
      attempt("insert into public.session_attendees (session_id, user_id) values ($1, $2)", [
        sessionId,
        dave,
      ]),
    );
    expect(other.error?.code).toBe("42501");

    // Take Carol's seat by rewriting her row, or remove her from the roster.
    const takeSeat = await as(mallory, () =>
      attempt(
        "update public.session_attendees set user_id = $2 where session_id = $1 and user_id = $3",
        [sessionId, mallory, carol],
      ),
    );
    expect(takeSeat.error).toBeUndefined();
    expect(takeSeat.rowCount).toBe(0);

    const removeCarol = await as(mallory, () =>
      attempt("delete from public.session_attendees where session_id = $1 and user_id = $2", [
        sessionId,
        carol,
      ]),
    );
    expect(removeCarol.error).toBeUndefined();
    expect(removeCarol.rowCount).toBe(0);

    expect(await roster()).toEqual([alice, carol].sort());
  });

  it("cannot leave a session she is not in, or make anyone else leave", async () => {
    const leave = await as(mallory, () =>
      attempt("select public.leave_session($1)", [sessionId]),
    );
    expect(leave.error?.code).toBe("P0001");
    expect(leave.error?.message).toMatch(/not_joined/);

    // There is no parameter through which to name another student: the
    // function only ever acts on auth.uid(). A second argument is not a
    // different call to the same function; no such function exists.
    const { rows } = await db.query<{ args: string }>(
      `select pg_get_function_identity_arguments(oid) as args
       from pg_proc
       where pronamespace = 'public'::regnamespace and proname in ('join_session', 'leave_session')`,
    );
    expect(rows.map((row) => row.args)).toEqual(["session_id uuid", "session_id uuid"]);

    const onBehalf = await as(mallory, () =>
      attempt("select public.leave_session($1::uuid, $2::uuid)", [sessionId, carol]),
    );
    expect(onBehalf.error?.code).toBe("42883");

    expect(await roster()).toEqual([alice, carol].sort());
  });

  it("cannot read anyone's email address (US-25)", async () => {
    // auth.users is where emails live, and clients have no SELECT on it. The
    // query names the email column only: with a `where id = ...`, a grant on
    // just `email` would still be refused (on `id`) and hide the leak.
    const authUsers = await as(mallory, () => attempt("select email from auth.users"));
    expect(authUsers.error?.code).toBe("42501");
    expect(authUsers.error?.message).toMatch(/permission denied for table users/);

    const { rows: privileges } = await db.query(`
      select has_column_privilege('authenticated', 'auth.users', 'email', 'SELECT') as authenticated,
             has_column_privilege('anon', 'auth.users', 'email', 'SELECT') as anon
    `);
    expect(privileges).toEqual([{ authenticated: false, anon: false }]);

    // profiles has no email column to read.
    const profileEmail = await as(mallory, () =>
      attempt("select email from public.profiles where id = $1", [alice]),
    );
    expect(profileEmail.error?.code).toBe("42703");

    // What she can read about Alice is her id, name and join date.
    const visible = await as(mallory, () =>
      attempt("select * from public.profiles where id = $1", [alice]),
    );
    expect(Object.keys(visible.rows[0] ?? {}).sort()).toEqual(
      ["created_at", "display_name", "id"],
    );

    // No table or view in a schema the Data API exposes (config.toml [api])
    // has a column that could hold an email. Read as the database's own role,
    // which information_schema shows every column to.
    const { rows } = await db.query(
      `select table_schema, table_name, column_name from information_schema.columns
       where table_schema in ('public', 'graphql_public') and column_name ilike '%mail%'`,
    );
    expect(rows).toEqual([]);
  });

  it("cannot change, delete or forge someone else's session", async () => {
    const update = await as(mallory, () =>
      attempt("update public.sessions set topic = 'Cancelled, go home' where id = $1", [
        sessionId,
      ]),
    );
    expect(update.error).toBeUndefined();
    expect(update.rowCount).toBe(0);

    const remove = await as(mallory, () =>
      attempt("delete from public.sessions where id = $1", [sessionId]),
    );
    expect(remove.error).toBeUndefined();
    expect(remove.rowCount).toBe(0);

    // A session "hosted" by Alice that Alice never created.
    const forged = await as(mallory, () =>
      attempt(
        `insert into public.sessions
           (host_id, course_id, location_id, location_label, topic, starts_at, ends_at, capacity)
         select $1, course_id, location_id, location_label, 'Forged', starts_at, ends_at, capacity
         from public.sessions where id = $2`,
        [alice, sessionId],
      ),
    );
    expect(forged.error?.code).toBe("42501");

    const { rows } = await db.query("select host_id, topic from public.sessions where id = $1", [
      sessionId,
    ]);
    expect(rows).toEqual([{ host_id: alice, topic: "IDOR review" }]);
  });

  it("cannot add a department or course in someone else's name", async () => {
    const department = await as(mallory, () =>
      attempt("insert into public.departments (code, created_by) values ('IDORX', $1)", [alice]),
    );
    expect(department.error?.code).toBe("42501");

    const course = await as(mallory, () =>
      attempt(
        "insert into public.courses (department_code, number, created_by) values ('CS', '9999', $1)",
        [alice],
      ),
    );
    expect(course.error?.code).toBe("42501");
  });
});

describe("A01: a signed-out visitor with the public anon key", () => {
  it("sees no session, no roster and no profile", async () => {
    const sessions = await as(null, () => attempt("select id from public.sessions"));
    expect(sessions.error).toBeUndefined();
    expect(sessions.rows).toEqual([]);

    // Live roster revokes anon on session_attendees (same pattern as A2 on
    // profiles): Realtime does not apply RLS to DELETE events, so a grant
    // would leak leave payloads to signed-out listeners.
    const attendees = await as(null, () => attempt("select user_id from public.session_attendees"));
    expect(attendees.error?.code).toBe("42501");

    const profiles = await as(null, () => attempt("select id from public.profiles"));
    expect(profiles.error?.code).toBe("42501");
  });
});

describe("A01: the SECURITY DEFINER functions cannot be redirected", () => {
  // create_session, join_session and leave_session run with the owner's rights
  // and `set search_path = public`. pg_catalog is still searched first, so a
  // caller could only shadow a name they use by creating an object in public.
  it("gives neither client role CREATE on the public schema", async () => {
    const { rows } = await db.query(`
      select has_schema_privilege('authenticated', 'public', 'CREATE') as authenticated,
             has_schema_privilege('anon', 'public', 'CREATE') as anon
    `);
    expect(rows).toEqual([{ authenticated: false, anon: false }]);
  });
});
