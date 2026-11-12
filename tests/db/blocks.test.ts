import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * P4 · Block a user (US-22), *_p4_us_22_block_a_user.sql.
 *
 *   - blocks: read, insert and delete your own rows only (blocker_id =
 *     auth.uid()); nobody can read, insert or delete a row where they are
 *     blocked_id. Self-block refused. Cascade on delete, both sides.
 *   - join_session() refuses a caller the host has blocked, with the same
 *     refusal family as every other reason a join can fail.
 *
 * Harness as in academic-profile.test.ts: one connection, each test in a
 * rolled-back transaction, asUser() for SET LOCAL ROLE plus the JWT claims
 * auth.uid() reads.
 */

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
});

afterEach(async () => {
  await db.query("rollback");
});

type Attempt = { error?: DatabaseError; rowCount: number | null; rows: Record<string, unknown>[] };

/** Run a statement that may fail without aborting the test's transaction. */
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

/** Run `fn` as the Data API would for this user (null: signed out, `anon`). */
async function asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
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

/** An auth user (A2's trigger makes the profile) with a display name. */
async function createStudent(name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [`${name}.p4test.${Math.random().toString(36).slice(2, 10)}@vanderbilt.edu`],
  );
  await db.query("update public.profiles set display_name = $2 where id = $1", [rows[0].id, name]);
  return rows[0].id;
}

/** A course in a department made up for this test, so runs never collide. */
async function createCourse(): Promise<string> {
  const department = `ZZ${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z]/g, "Q")}`;
  await db.query("insert into public.departments (code) values ($1)", [department]);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.courses (department_code, number, title) values ($1, '3251', 'Test Course')
     returning id`,
    [department],
  );
  return rows[0].id;
}

let locationId: string;
let courseId: string;

beforeAll(async () => {
  const setup = await connect();
  try {
    const { rows } = await setup.query<{ id: string }>(
      `insert into public.locations (place_id, lat, lng)
       values ('ChIJ-test-p4-featheringill-hall', 36.1447, -86.8027)
       on conflict (place_id) do update set lat = excluded.lat
       returning id`,
    );
    locationId = rows[0].id;
  } finally {
    await setup.end();
  }
});

beforeEach(async () => {
  courseId = await createCourse();
});

/** `hostId` hosts an open session in the shared test course, through create_session(). */
async function hostSession(hostId: string): Promise<string> {
  const startsAt = new Date(Date.now() + 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 120 * 60 * 1000);
  const { rows } = await asUser(hostId, () =>
    db.query<{ id: string }>(
      `select (public.create_session(
         $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
         $6::timestamptz, $7::timestamptz, $8::integer
       )).id`,
      [courseId, locationId, "Featheringill Hall", "134", "P4 test session", startsAt.toISOString(), endsAt.toISOString(), 4],
    ),
  );
  return rows[0].id;
}

async function block(blockerId: string, blockedId: string): Promise<void> {
  await asUser(blockerId, () =>
    db.query("insert into public.blocks (blocked_id) values ($1)", [blockedId]),
  );
}

async function joinSession(studentId: string, sessionId: string) {
  return asUser(studentId, () => attempt("select * from public.join_session($1)", [sessionId]));
}

describe("blocks RLS", () => {
  it("lets the blocker read their own row, and nobody else", async () => {
    const a = await createStudent("A");
    const b = await createStudent("B");
    await block(a, b);

    const asBlocker = await asUser(a, () =>
      db.query("select blocked_id from public.blocks where blocker_id = $1", [a]),
    );
    expect(asBlocker.rows).toEqual([{ blocked_id: b }]);

    // B cannot read it by any query shape -- not filtered on blocker_id,
    // not filtered on blocked_id, not select *.
    const asBlockedAll = await asUser(b, () => db.query("select * from public.blocks"));
    expect(asBlockedAll.rows).toEqual([]);
    const asBlockedFiltered = await asUser(b, () =>
      db.query("select * from public.blocks where blocked_id = $1", [b]),
    );
    expect(asBlockedFiltered.rows).toEqual([]);
  });

  it("refuses an insert naming someone else as the blocker", async () => {
    const a = await createStudent("A");
    const b = await createStudent("B");
    const c = await createStudent("C");

    const result = await asUser(a, () =>
      attempt("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [b, c]),
    );
    expect(result.error?.code).toBe("42501");
  });

  it("refuses a self-block", async () => {
    const a = await createStudent("A");

    const result = await asUser(a, () =>
      attempt("insert into public.blocks (blocked_id) values ($1)", [a]),
    );
    expect(result.error?.message).toContain('"blocks_not_self"');
  });

  it("lets the blocker delete their own block, undoing it", async () => {
    const a = await createStudent("A");
    const b = await createStudent("B");
    await block(a, b);

    await asUser(a, () =>
      db.query("delete from public.blocks where blocker_id = $1 and blocked_id = $2", [a, b]),
    );

    const { rows } = await db.query("select * from public.blocks where blocker_id = $1", [a]);
    expect(rows).toEqual([]);
  });

  it("refuses anon entirely", async () => {
    const result = await asUser(null, () => attempt("select * from public.blocks"));
    expect(result.error?.code).toBe("42501");
  });

  it("cascades when either account is deleted", async () => {
    const a = await createStudent("A");
    const b = await createStudent("B");
    await block(a, b);

    await db.query("delete from auth.users where id = $1", [a]);
    const afterBlockerDeleted = await db.query(
      "select * from public.blocks where blocked_id = $1",
      [b],
    );
    expect(afterBlockerDeleted.rows).toEqual([]);

    const c = await createStudent("C");
    const d = await createStudent("D");
    await block(c, d);
    await db.query("delete from auth.users where id = $1", [d]);
    const afterBlockedDeleted = await db.query(
      "select * from public.blocks where blocker_id = $1",
      [c],
    );
    expect(afterBlockedDeleted.rows).toEqual([]);
  });
});

describe("join_session refuses a caller the host has blocked", () => {
  it("refuses the join, with the same refusal family as a made-up session", async () => {
    const host = await createStudent("Host");
    const student = await createStudent("Student");
    const sessionId = await hostSession(host);
    await block(host, student);

    const result = await joinSession(student, sessionId);
    expect(result.error?.message).toBe("cannot_join_session");

    // Never actually seated.
    const { rows } = await db.query(
      "select 1 from public.session_attendees where session_id = $1 and user_id = $2",
      [sessionId, student],
    );
    expect(rows).toEqual([]);
  });

  it("leaves another student's join alone", async () => {
    const host = await createStudent("Host");
    const blocked = await createStudent("Blocked");
    const other = await createStudent("Other");
    const sessionId = await hostSession(host);
    await block(host, blocked);

    const result = await joinSession(other, sessionId);
    expect(result.error).toBeUndefined();

    const { rows } = await db.query(
      "select 1 from public.session_attendees where session_id = $1 and user_id = $2",
      [sessionId, other],
    );
    expect(rows).toHaveLength(1);
  });

  it("does not refuse the reverse direction -- the caller blocking the host changes nothing", async () => {
    const host = await createStudent("Host");
    const student = await createStudent("Student");
    const sessionId = await hostSession(host);
    // The STUDENT blocks the host, not the other way around -- join_session
    // only ever checks whether the HOST blocked the CALLER.
    await block(student, host);

    const result = await joinSession(student, sessionId);
    expect(result.error).toBeUndefined();
  });
});
