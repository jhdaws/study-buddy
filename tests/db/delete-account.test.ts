import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * Deleting an account (US-24): ADR 0008 rule 5 and "What happens on delete",
 * plus P2's trigger (*_delete_account.sql) that cancels the student's
 * upcoming hosted sessions in the same transaction.
 *
 * deleteAccount() deletes the auth user through Supabase Auth's admin API,
 * which runs `delete from auth.users` -- a direct delete here stands in for
 * it (and for a deletion from the dashboard, which the trigger covers too).
 * Every test runs inside a transaction that is rolled back.
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

type Attempt = { error?: DatabaseError; rowCount: number | null };

async function attempt(sql: string, params: unknown[] = []): Promise<Attempt> {
  await db.query("savepoint attempt");
  try {
    const result = await db.query(sql, params);
    await db.query("release savepoint attempt");
    return { rowCount: result.rowCount };
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    return { error: error as DatabaseError, rowCount: null };
  }
}

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

async function createStudent(name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [`${name}.p2test.${Math.random().toString(36).slice(2, 10)}@vanderbilt.edu`],
  );
  await db.query("update public.profiles set display_name = $2 where id = $1", [rows[0].id, name]);
  return rows[0].id;
}

let courseId: string;
let locationId: string;

/**
 * A session hosted by `hostId` from `startHours` to `endHours` from now,
 * inserted directly (create_session refuses past starts, and some of these
 * sessions are meant to be over). The host is seated, as create_session does.
 */
async function createSession(
  hostId: string,
  startHours: number,
  endHours: number,
  status: "open" | "cancelled" = "open",
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions
       (host_id, course_id, location_id, location_label, topic, starts_at, ends_at, capacity, status)
     values ($1, $2, $3, 'Central Library', 'P2 deletion test',
             now() + make_interval(hours => $4), now() + make_interval(hours => $5), 4, $6)
     returning id`,
    [hostId, courseId, locationId, startHours, endHours, status],
  );
  await db.query("insert into public.session_attendees (session_id, user_id) values ($1, $2)", [
    rows[0].id,
    hostId,
  ]);
  return rows[0].id;
}

async function join(sessionId: string, userId: string) {
  await db.query("insert into public.session_attendees (session_id, user_id) values ($1, $2)", [
    sessionId,
    userId,
  ]);
}

async function sessionState(id: string) {
  const { rows } = await db.query<{ status: string; host_id: string | null; attendees: number }>(
    `select s.status, s.host_id,
            (select count(*)::int from public.session_attendees a where a.session_id = s.id) as attendees
       from public.sessions s where s.id = $1`,
    [id],
  );
  return rows[0];
}

const deleteAccount = (userId: string) => db.query("delete from auth.users where id = $1", [userId]);

let leaving: string;
let staying: string;

beforeEach(async () => {
  leaving = await createStudent("Leaving");
  staying = await createStudent("Staying");
  const department = `ZZ${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z]/g, "Q")}`;
  await db.query("insert into public.departments (code) values ($1)", [department]);
  courseId = (
    await db.query<{ id: string }>(
      "insert into public.courses (department_code, number) values ($1, '1000') returning id",
      [department],
    )
  ).rows[0].id;
  locationId = (
    await db.query<{ id: string }>(
      "insert into public.locations (place_id, lat, lng) values ($1, 36.1447, -86.8027) returning id",
      [`p2-test-${Math.random()}`],
    )
  ).rows[0].id;
});

describe("deleting an account removes the student's data", () => {
  it("deletes their profile", async () => {
    await deleteAccount(leaving);
    const { rows } = await db.query("select 1 from public.profiles where id = $1", [leaving]);
    expect(rows).toEqual([]);
  });

  it("removes them from every roster, freeing their seats", async () => {
    const session = await createSession(staying, 2, 4);
    await join(session, leaving);
    expect((await sessionState(session)).attendees).toBe(2);

    await deleteAccount(leaving);

    expect(await sessionState(session)).toEqual({ status: "open", host_id: staying, attendees: 1 });
    const { rows } = await db.query("select 1 from public.session_attendees where user_id = $1", [leaving]);
    expect(rows).toEqual([]);
  });

  it("deletes their study requests (US-16), so the counts stop including them", async () => {
    await db.query("insert into public.study_requests (course_id, author_id) values ($1, $2)", [
      courseId,
      leaving,
    ]);
    await db.query("insert into public.study_requests (course_id, author_id) values ($1, $2)", [
      courseId,
      staying,
    ]);

    await deleteAccount(leaving);

    const { rows } = await db.query<{ author_id: string }>(
      "select author_id from public.study_requests where course_id = $1",
      [courseId],
    );
    expect(rows).toEqual([{ author_id: staying }]);
  });

  it("keeps courses and departments they added, without their name", async () => {
    const { rows } = await db.query<{ code: string }>(
      "insert into public.departments (code, created_by) values ('ZZP2DEL', $1) returning code",
      [leaving],
    );
    const course = await db.query<{ id: string }>(
      "insert into public.courses (department_code, number, created_by) values ($1, '2000', $2) returning id",
      [rows[0].code, leaving],
    );

    await deleteAccount(leaving);

    const after = await db.query(
      `select (select created_by from public.departments where code = 'ZZP2DEL') as department_by,
              (select created_by from public.courses where id = $1) as course_by`,
      [course.rows[0].id],
    );
    expect(after.rows).toEqual([{ department_by: null, course_by: null }]);
  });
});

describe("deleting an account and the sessions they host (ADR 0008 rule 5)", () => {
  it("cancels an upcoming hosted session, keeps it for its attendees, and shows no host", async () => {
    const session = await createSession(leaving, 2, 4);
    await join(session, staying);

    await deleteAccount(leaving);

    // Cancelled -- attendees see the notice -- and the host is "Deleted user".
    // The other attendee's roster row stays: it is their record too.
    expect(await sessionState(session)).toEqual({ status: "cancelled", host_id: null, attendees: 1 });
  });

  it("cancels one already in progress: it has not ended", async () => {
    const session = await createSession(leaving, -1, 1);
    await deleteAccount(leaving);
    expect((await sessionState(session)).status).toBe("cancelled");
  });

  it("leaves an ended session as it was, without the host", async () => {
    const session = await createSession(leaving, -4, -2);
    await deleteAccount(leaving);
    expect(await sessionState(session)).toEqual({ status: "open", host_id: null, attendees: 0 });
  });

  it("leaves an already-cancelled session cancelled", async () => {
    const session = await createSession(leaving, 2, 4, "cancelled");
    await deleteAccount(leaving);
    expect((await sessionState(session)).status).toBe("cancelled");
  });

  it("does not touch anyone else's sessions", async () => {
    const theirs = await createSession(staying, 2, 4);
    await join(theirs, leaving);
    await createSession(leaving, 2, 4);

    await deleteAccount(leaving);

    expect(await sessionState(theirs)).toEqual({ status: "open", host_id: staying, attendees: 1 });
  });

  it("cancels in the same statement as the delete: rolled back together", async () => {
    const session = await createSession(leaving, 2, 4);
    await db.query("savepoint before_delete");
    await deleteAccount(leaving);
    expect((await sessionState(session)).status).toBe("cancelled");
    await db.query("rollback to savepoint before_delete");

    expect(await sessionState(session)).toEqual({ status: "open", host_id: leaving, attendees: 1 });
  });
});

describe("only the auth server deletes accounts", () => {
  it("refuses a signed-in student deleting auth users or profiles directly", async () => {
    for (const sql of [
      "delete from auth.users where id = $1",
      "delete from public.profiles where id = $1",
    ]) {
      const { error } = await asUser(leaving, () => attempt(sql, [leaving]));
      expect(error?.code, sql).toBe("42501");
    }
  });

  it("refuses a signed-out caller too", async () => {
    const { error } = await asUser(null, () => attempt("delete from auth.users where id = $1", [leaving]));
    expect(error?.code).toBe("42501");
  });

  it("keeps the trigger function out of the Data API and off-limits to clients", async () => {
    const { rows } = await db.query<{ schema: string; definer: boolean; anon: boolean; authed: boolean }>(`
      select n.nspname as schema, p.prosecdef as definer,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authed
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = 'cancel_hosted_sessions_on_profile_delete'
    `);
    expect(rows).toEqual([{ schema: "private", definer: true, anon: false, authed: false }]);
  });
});
