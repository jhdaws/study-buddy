import type { Client } from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * R1 -- study_requests: its policies, its trigger and its unique constraint
 * (supabase/migrations/20261110172905_r1_study_requests.sql).
 *
 * This table is the one place in the schema written through RLS POLICIES
 * rather than a SECURITY DEFINER function, so the policies are not a second
 * line of defence here -- they are the only one. That makes two questions
 * worth more than the rest, and they are the two this file leads with:
 *
 *   - can a student post a request in someone ELSE's name? (the insert
 *     policy)
 *   - can a student withdraw someone else's request? (the delete policy)
 *
 * Both were checked by mutation against the live database, because a test
 * that has never failed is a claim rather than evidence:
 *
 *   - `with check (true)` on study_requests_insert fails "refuses a request
 *     posted in someone else's name" and "refuses a request with no author".
 *   - `using (true)` on study_requests_delete fails "will not let a student
 *     withdraw someone else's request" and "deletes nothing when a student
 *     tries to clear the whole table".
 *
 * "refuses a signed-out caller" survives both, which is the right answer:
 * `to authenticated` keeps anon out whatever the qualifier says.
 *
 * Run against the real local database: `npm run db:start && npm run test:db`.
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

/**
 * Every test starts with an empty table. Most tests only look at their own
 * rows, but the ones that COUNT ("2 students want this course") cannot: they
 * would otherwise count everything every earlier test left behind, and they
 * did -- that assertion first ran green at 30.
 */
beforeEach(async () => {
  const db = await connect();
  try {
    await db.query("delete from public.study_requests");
  } finally {
    await db.end();
  }
});

let courseId: string;
let otherCourseId: string;

beforeAll(async () => {
  const db = await connect();
  try {
    await db.query(`
      insert into public.departments (code) values ('CS')
      on conflict (code) do nothing
    `);

    const course = await db.query<{ id: string }>(`
      insert into public.courses (department_code, number, title)
      values ('CS', '4278', 'Principles of Software Engineering')
      on conflict (department_code, number) do update set title = excluded.title
      returning id
    `);
    courseId = course.rows[0].id;

    const other = await db.query<{ id: string }>(`
      insert into public.courses (department_code, number, title)
      values ('CS', '3251', 'Intermediate Software Design')
      on conflict (department_code, number) do update set title = excluded.title
      returning id
    `);
    otherCourseId = other.rows[0].id;
  } finally {
    await db.end();
  }
});

/** Runs `fn` as the database's own role (bypassing RLS), then restores `authenticated`. */
async function asServer<T>(db: Client, fn: () => Promise<T>): Promise<T> {
  await db.query("reset role");
  try {
    return await fn();
  } finally {
    await db.query("set role authenticated");
  }
}

/** Inserts a request for `authorId` without going through RLS -- test setup only. */
async function seedRequest(
  db: Client,
  authorId: string,
  options: { courseId?: string; note?: string | null } = {},
): Promise<string> {
  return asServer(db, async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.study_requests (course_id, author_id, note)
       values ($1, $2, $3)
       returning id`,
      [options.courseId ?? courseId, authorId, options.note ?? null],
    );
    return rows[0].id;
  });
}

/**
 * An auth user, created with the server's role. Needed because these tests
 * make a second user AFTER signing in as the first, and `authenticated`
 * cannot write auth.users -- it gets "permission denied for table users".
 */
async function newUser(db: Client, displayName: string): Promise<string> {
  return asServer(db, () => createUser(db, { displayName }));
}

/** A signed-in student with a display name, already authenticated on `db`. */
async function student(db: Client, displayName = "Asker"): Promise<string> {
  const id = await newUser(db, displayName);
  await signInAs(db, id);
  return id;
}

describe("study_requests insert policy", () => {
  it("lets a signed-in student post a request for themselves", async () => {
    const db = await connection();
    const me = await student(db);

    const { rows } = await db.query<{ id: string; author_id: string }>(
      `insert into public.study_requests (course_id, author_id, note)
       values ($1, $2, 'Tue evening would suit me')
       returning id, author_id`,
      [courseId, me],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].author_id).toBe(me);
  });

  // THE IDOR. A request is a vote; posting one in a classmate's name would
  // let one student manufacture demand, and the policy is all that stops it.
  it("refuses a request posted in someone else's name", async () => {
    const db = await connection();
    const victim = await newUser(db, "Victim");
    await student(db, "Impostor");

    await expect(
      db.query(
        `insert into public.study_requests (course_id, author_id)
         values ($1, $2)`,
        [courseId, victim],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses a request with no author at all", async () => {
    const db = await connection();
    await student(db);

    // 42501 (the policy), not 23502 (the NOT NULL): `null = auth.uid()` is
    // NULL rather than true, so WITH CHECK refuses the row before the column
    // constraint is ever reached. Worth pinning down -- it means the policy
    // is load-bearing here, not just the column.
    await expect(
      db.query(`insert into public.study_requests (course_id) values ($1)`, [courseId]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses a signed-out caller", async () => {
    const db = await connection();
    const me = await newUser(db, "Signed out");

    await db.query("set role anon");
    await expect(
      db.query(
        `insert into public.study_requests (course_id, author_id) values ($1, $2)`,
        [courseId, me],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("study_requests delete policy", () => {
  it("lets the author withdraw their own request", async () => {
    const db = await connection();
    const me = await student(db);
    const requestId = await seedRequest(db, me);

    const { rowCount } = await db.query(`delete from public.study_requests where id = $1`, [
      requestId,
    ]);

    expect(rowCount).toBe(1);
  });

  // THE OTHER IDOR. RLS refuses a delete SILENTLY -- no error, no rows --
  // which is why withdrawRequest() asks for an exact count rather than
  // trusting the absence of an error.
  it("will not let a student withdraw someone else's request", async () => {
    const db = await connection();
    const victim = await newUser(db, "Victim");
    const requestId = await seedRequest(db, victim);
    await student(db, "Impostor");

    const { rowCount } = await db.query(`delete from public.study_requests where id = $1`, [
      requestId,
    ]);

    expect(rowCount).toBe(0);

    // And the row is still there, not merely unreported as deleted.
    const survived = await asServer(db, () =>
      db.query(`select 1 from public.study_requests where id = $1`, [requestId]),
    );
    expect(survived.rowCount).toBe(1);
  });

  it("deletes nothing when a student tries to clear the whole table", async () => {
    const db = await connection();
    const victim = await newUser(db, "Victim");
    await seedRequest(db, victim);
    await seedRequest(db, victim, { courseId: otherCourseId });
    const me = await student(db, "Impostor");
    await db.query(
      `insert into public.study_requests (course_id, author_id) values ($1, $2)`,
      [courseId, me],
    );

    // An unfiltered delete: the policy narrows it to the caller's own row.
    const { rowCount } = await db.query(`delete from public.study_requests`);

    expect(rowCount).toBe(1);
  });
});

describe("study_requests read policy", () => {
  it("lets any signed-in student read a classmate's request", async () => {
    const db = await connection();
    const author = await newUser(db, "Author");
    const requestId = await seedRequest(db, author, { note: "Any evening" });
    await student(db, "Reader");

    const { rows } = await db.query<{ note: string | null }>(
      `select note from public.study_requests where id = $1`,
      [requestId],
    );

    // The point of a request is that classmates see it.
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("Any evening");
  });

  it("shows a signed-out caller nothing", async () => {
    const db = await connection();
    const author = await newUser(db, "Author");
    await seedRequest(db, author);

    await db.query("set role anon");
    // Refused outright since SEC-14 (anon holds no privilege on public
    // tables); before, RLS returned no rows.
    await expect(db.query(`select 1 from public.study_requests`)).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("study_requests has no update path", () => {
  it("ignores an update even from the author", async () => {
    const db = await connection();
    const me = await student(db);
    const requestId = await seedRequest(db, me, { note: "Original" });

    // No UPDATE policy, so this matches no rows rather than erroring.
    const { rowCount } = await db.query(
      `update public.study_requests set note = 'Rewritten' where id = $1`,
      [requestId],
    );

    expect(rowCount).toBe(0);

    const after = await db.query<{ note: string | null }>(
      `select note from public.study_requests where id = $1`,
      [requestId],
    );
    expect(after.rows[0].note).toBe("Original");
  });

  // Why it matters that UPDATE is closed: BEFORE INSERT does not fire on
  // UPDATE, so an update policy would hand back the expires_at the trigger
  // takes away below.
  it("will not let the author push their own expiry out", async () => {
    const db = await connection();
    const me = await student(db);
    const requestId = await seedRequest(db, me);

    const { rowCount } = await db.query(
      `update public.study_requests set expires_at = now() + interval '100 years'
       where id = $1`,
      [requestId],
    );

    expect(rowCount).toBe(0);
  });
});

describe("study_requests server-set fields", () => {
  it("expires seven days out by default", async () => {
    const db = await connection();
    const me = await student(db);

    const { rows } = await db.query<{ days: string }>(
      `insert into public.study_requests (course_id, author_id)
       values ($1, $2)
       returning extract(day from expires_at - created_at)::text as days`,
      [courseId, me],
    );

    expect(rows[0].days).toBe("7");
  });

  // The whole reason the trigger exists: a client that sends its own
  // timestamps does not get to keep them, or "live request" stops meaning
  // anything.
  it("overrides timestamps the client sends", async () => {
    const db = await connection();
    const me = await student(db);

    const { rows } = await db.query<{ far_future: boolean; days: string }>(
      `insert into public.study_requests (course_id, author_id, created_at, expires_at)
       values ($1, $2, now() + interval '50 years', now() + interval '100 years')
       returning
         expires_at > now() + interval '1 year' as far_future,
         extract(day from expires_at - created_at)::text as days`,
      [courseId, me],
    );

    expect(rows[0].far_future).toBe(false);
    expect(rows[0].days).toBe("7");
  });

  it("stores a blank note as null", async () => {
    const db = await connection();
    const me = await student(db);

    const { rows } = await db.query<{ note: string | null }>(
      `insert into public.study_requests (course_id, author_id, note)
       values ($1, $2, '   ')
       returning note`,
      [courseId, me],
    );

    expect(rows[0].note).toBeNull();
  });

  it("trims a note rather than storing the spaces", async () => {
    const db = await connection();
    const me = await student(db);

    const { rows } = await db.query<{ note: string | null }>(
      `insert into public.study_requests (course_id, author_id, note)
       values ($1, $2, '  Tue evening  ')
       returning note`,
      [courseId, me],
    );

    expect(rows[0].note).toBe("Tue evening");
  });
});

describe("study_requests constraints", () => {
  it("counts one student once per course", async () => {
    const db = await connection();
    const me = await student(db);

    await db.query(
      `insert into public.study_requests (course_id, author_id) values ($1, $2)`,
      [courseId, me],
    );

    // What makes the count on /sessions a count of PEOPLE.
    await expect(
      db.query(`insert into public.study_requests (course_id, author_id) values ($1, $2)`, [
        courseId,
        me,
      ]),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("lets one student ask for two different courses", async () => {
    const db = await connection();
    const me = await student(db);

    await db.query(
      `insert into public.study_requests (course_id, author_id) values ($1, $2)`,
      [courseId, me],
    );
    const second = await db.query(
      `insert into public.study_requests (course_id, author_id) values ($1, $2)`,
      [otherCourseId, me],
    );

    expect(second.rowCount).toBe(1);
  });

  it("lets two students ask for the same course", async () => {
    const db = await connection();
    const first = await newUser(db, "First");
    await seedRequest(db, first);
    const me = await student(db, "Second");

    const { rowCount } = await db.query(
      `insert into public.study_requests (course_id, author_id) values ($1, $2)`,
      [courseId, me],
    );

    expect(rowCount).toBe(1);

    const counted = await db.query<{ count: string }>(
      `select count(*)::text as count from public.study_requests where course_id = $1`,
      [courseId],
    );
    expect(counted.rows[0].count).toBe("2");
  });

  it("refuses a note longer than 200 characters", async () => {
    const db = await connection();
    const me = await student(db);

    await expect(
      db.query(
        `insert into public.study_requests (course_id, author_id, note) values ($1, $2, $3)`,
        [courseId, me, "x".repeat(201)],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("accepts a note of exactly 200 characters", async () => {
    const db = await connection();
    const me = await student(db);

    const { rowCount } = await db.query(
      `insert into public.study_requests (course_id, author_id, note) values ($1, $2, $3)`,
      [courseId, me, "x".repeat(200)],
    );

    expect(rowCount).toBe(1);
  });

  it("goes away with its author's account", async () => {
    const db = await connection();
    const leaver = await newUser(db, "Leaver");
    const requestId = await seedRequest(db, leaver);

    await asServer(db, () => db.query(`delete from auth.users where id = $1`, [leaver]));

    // `on delete cascade`, unlike sessions' `set null`: "4 students want CS
    // 3251" must not keep counting an account that no longer exists.
    const after = await asServer(db, () =>
      db.query(`select 1 from public.study_requests where id = $1`, [requestId]),
    );
    expect(after.rowCount).toBe(0);
  });
});
