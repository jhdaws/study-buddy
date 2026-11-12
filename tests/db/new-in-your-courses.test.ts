import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * N1 · US-17 -- "new sessions in your courses"
 * (supabase/migrations/*_n1_new_in_your_courses.sql).
 *
 *   - count_new_sessions_in_my_courses(): read-only count, for the nav badge.
 *   - new_sessions_in_my_courses(): the Home page's list; also resets
 *     last_seen_sessions_at as a side effect.
 *   - mark_sessions_seen(): resets the clock with nothing to return, for
 *     /sessions.
 *
 * All three are SECURITY DEFINER and the only way to touch
 * last_seen_sessions_at at all -- there is no SELECT or UPDATE grant on the
 * column itself, not even for its own owner (see the migration's "WHY THIS
 * COLUMN HAS NO SELECT OR UPDATE GRANT" comment). That is checked directly
 * below, alongside the notification logic itself.
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
    [`${name}.n1test.${Math.random().toString(36).slice(2, 10)}@vanderbilt.edu`],
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

beforeAll(async () => {
  const setup = await connect();
  try {
    const { rows } = await setup.query<{ id: string }>(
      `insert into public.locations (place_id, lat, lng)
       values ('ChIJ-test-n1-featheringill-hall', 36.1447, -86.8027)
       on conflict (place_id) do update set lat = excluded.lat
       returning id`,
    );
    locationId = rows[0].id;
  } finally {
    await setup.end();
  }
});

/** Enroll `studentId` in `courseId` (P1's profile_courses, own-row insert). */
async function enroll(studentId: string, courseId: string): Promise<void> {
  await asUser(studentId, () =>
    db.query("insert into public.profile_courses (course_id) values ($1)", [courseId]),
  );
}

type SessionOptions = {
  status?: "open" | "cancelled";
  endsInMinutes?: number;
  createdSecondsAgo?: number;
};

/**
 * A session in `courseId`, hosted by `hostId`. Inserted directly (bypassing
 * create_session(), which refuses a past start and does not let a test pick
 * created_at) -- this runs as the connection's own role, which is not
 * `authenticated`, so RLS (there is no INSERT policy on sessions at all) does
 * not apply.
 */
async function hostSession(
  hostId: string,
  courseId: string,
  options: SessionOptions = {},
): Promise<string> {
  const endsAt = new Date(Date.now() + (options.endsInMinutes ?? 120) * 60 * 1000);
  const startsAt = new Date(Math.min(Date.now() + 60 * 60 * 1000, endsAt.getTime() - 60 * 1000));
  const createdAt = new Date(Date.now() - (options.createdSecondsAgo ?? 0) * 1000);

  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions
       (host_id, course_id, location_id, location_label, room, topic,
        starts_at, ends_at, capacity, status, created_at)
     values ($1, $2, $3, 'Featheringill Hall', '134', 'N1 test session',
             $4, $5, 4, $6, $7)
     returning id`,
    [
      hostId,
      courseId,
      locationId,
      startsAt.toISOString(),
      endsAt.toISOString(),
      options.status ?? "open",
      createdAt.toISOString(),
    ],
  );
  return rows[0].id;
}

async function countNew(studentId: string): Promise<number> {
  const { rows } = await asUser(studentId, () =>
    db.query<{ count_new_sessions_in_my_courses: number }>(
      "select public.count_new_sessions_in_my_courses()",
    ),
  );
  return rows[0].count_new_sessions_in_my_courses;
}

async function listNew(studentId: string): Promise<{ id: string; topic: string }[]> {
  const { rows } = await asUser(studentId, () =>
    db.query<{ id: string; topic: string }>("select * from public.new_sessions_in_my_courses()"),
  );
  return rows;
}

describe("count_new_sessions_in_my_courses / new_sessions_in_my_courses", () => {
  it("counts an open session in an enrolled course, hosted by someone else", async () => {
    const me = await createStudent("Me");
    const host = await createStudent("Host");
    const course = await createCourse();
    await enroll(me, course);
    const sessionId = await hostSession(host, course);

    expect(await countNew(me)).toBe(1);
    const list = await listNew(me);
    expect(list.map((row) => row.id)).toEqual([sessionId]);
  });

  it("does not count a session the student hosts themselves", async () => {
    const me = await createStudent("Me");
    const course = await createCourse();
    await enroll(me, course);
    await hostSession(me, course);

    expect(await countNew(me)).toBe(0);
    expect(await listNew(me)).toEqual([]);
  });

  it("leaves out a session hosted by someone the student has blocked (US-22)", async () => {
    const me = await createStudent("Me");
    const blocked = await createStudent("Blocked");
    const other = await createStudent("Other");
    const course = await createCourse();
    await enroll(me, course);
    await hostSession(blocked, course);
    const visible = await hostSession(other, course);
    // As the database's own role: blocks rows are the blocker's to write.
    await db.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [
      me,
      blocked,
    ]);

    expect(await countNew(me)).toBe(1);
    expect((await listNew(me)).map((row) => row.id)).toEqual([visible]);
  });

  it("does not count a session in a course the student is not enrolled in", async () => {
    const me = await createStudent("Me");
    const host = await createStudent("Host");
    const myCourse = await createCourse();
    const otherCourse = await createCourse();
    await enroll(me, myCourse);
    await hostSession(host, otherCourse);

    expect(await countNew(me)).toBe(0);
  });

  it("does not count a cancelled session", async () => {
    const me = await createStudent("Me");
    const host = await createStudent("Host");
    const course = await createCourse();
    await enroll(me, course);
    await hostSession(host, course, { status: "cancelled" });

    expect(await countNew(me)).toBe(0);
  });

  it("does not count a session that has already ended", async () => {
    const me = await createStudent("Me");
    const host = await createStudent("Host");
    const course = await createCourse();
    await enroll(me, course);
    await hostSession(host, course, { endsInMinutes: -5 });

    expect(await countNew(me)).toBe(0);
  });

  it("new_sessions_in_my_courses() marks seen: the same session is not returned twice", async () => {
    const me = await createStudent("Me");
    const host = await createStudent("Host");
    const course = await createCourse();
    await enroll(me, course);
    await hostSession(host, course);

    expect(await listNew(me)).toHaveLength(1);
    // Nothing new has happened since the first call reset the clock.
    expect(await listNew(me)).toEqual([]);
    expect(await countNew(me)).toBe(0);
  });

  it("a session created before the student's last visit does not count", async () => {
    const me = await createStudent("Me");
    const host = await createStudent("Host");
    const course = await createCourse();
    // Older than the profile's own last_seen_sessions_at (defaults to the
    // moment the profile was created, a few statements ago).
    await hostSession(host, course, { createdSecondsAgo: 3600 });
    await enroll(me, course);

    expect(await countNew(me)).toBe(0);
  });
});

describe("mark_sessions_seen", () => {
  it("resets the clock without returning anything, and the student's own call never sees it", async () => {
    const me = await createStudent("Me");
    const host = await createStudent("Host");
    const course = await createCourse();
    await enroll(me, course);
    await hostSession(host, course);

    expect(await countNew(me)).toBe(1);

    const result = await asUser(me, () => db.query("select public.mark_sessions_seen()"));
    expect(result.rows[0].mark_sessions_seen).toBeNull();

    expect(await countNew(me)).toBe(0);
  });
});

describe("last_seen_sessions_at has no SELECT or UPDATE grant -- not even for its own owner", () => {
  it("refuses a signed-in student reading their own column directly", async () => {
    const me = await createStudent("Me");

    const result = await asUser(me, () =>
      attempt("select last_seen_sessions_at from public.profiles where id = $1", [me]),
    );
    expect(result.error?.code).toBe("42501");
  });

  it("refuses a signed-in student writing their own column directly", async () => {
    const me = await createStudent("Me");

    const result = await asUser(me, () =>
      attempt("update public.profiles set last_seen_sessions_at = now() where id = $1", [me]),
    );
    expect(result.error?.code).toBe("42501");
  });

  it("is absent from select * -- the idor.test.ts allow-list stays exactly as before", async () => {
    const me = await createStudent("Me");
    const other = await createStudent("Other");

    const { rows } = await asUser(other, () =>
      attempt("select * from public.profiles where id = $1", [me]),
    );
    expect(Object.keys(rows[0] ?? {})).not.toContain("last_seen_sessions_at");
  });
});

describe("the three functions refuse a signed-out caller", () => {
  it("count_new_sessions_in_my_courses", async () => {
    const result = await asUser(null, () =>
      attempt("select public.count_new_sessions_in_my_courses()"),
    );
    expect(result.error?.code).toBe("42501");
  });

  it("new_sessions_in_my_courses", async () => {
    const result = await asUser(null, () =>
      attempt("select * from public.new_sessions_in_my_courses()"),
    );
    expect(result.error?.code).toBe("42501");
  });

  it("mark_sessions_seen", async () => {
    const result = await asUser(null, () => attempt("select public.mark_sessions_seen()"));
    expect(result.error?.code).toBe("42501");
  });
});
