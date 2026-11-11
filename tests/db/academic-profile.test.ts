import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * P1's academic profile (supabase/migrations/*_academic_profile.sql, US-11)
 * and US-11b: a student can see another's name, major and year, never their
 * email.
 *
 *   - major, minor, class_year: each student updates only their own, and the
 *     extended column grant still leaves id and created_at unwritable.
 *   - The CHECKs mirror profileSchema.
 *   - profile_courses: anyone signed in reads; each student inserts and
 *     deletes only their own rows; at most 8; nothing for signed-out callers.
 *
 * Every test runs inside a transaction that is rolled back. Callers are
 * simulated the way profiles.test.ts does it: SET LOCAL ROLE plus the JWT
 * claims auth.uid() reads.
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
    [`${name}.p1test.${Math.random().toString(36).slice(2, 10)}@vanderbilt.edu`],
  );
  await db.query("update public.profiles set display_name = $2 where id = $1", [rows[0].id, name]);
  return rows[0].id;
}

/** `count` courses in a department of their own, created as the seed would be. */
async function createCourses(count: number): Promise<string[]> {
  const department = `ZZ${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z]/g, "Q")}`;
  await db.query("insert into public.departments (code) values ($1)", [department]);
  const { rows } = await db.query<{ id: string }>(
    `insert into public.courses (department_code, number)
     select $1, lpad((1000 + n)::text, 4, '0') from generate_series(1, $2) as n
     returning id`,
    [department, count],
  );
  return rows.map((row) => row.id);
}

let me: string;
let other: string;

beforeEach(async () => {
  me = await createStudent("Me");
  other = await createStudent("Other");
});

describe("major, minor and year (US-11)", () => {
  it("lets a student set their own", async () => {
    const { error, rowCount } = await asUser(me, () =>
      attempt(
        "update public.profiles set major = 'Computer Science', minor = 'Math', class_year = 'junior' where id = $1",
        [me],
      ),
    );
    expect(error).toBeUndefined();
    expect(rowCount).toBe(1);
    const { rows } = await db.query("select major, minor, class_year from public.profiles where id = $1", [me]);
    expect(rows).toEqual([{ major: "Computer Science", minor: "Math", class_year: "junior" }]);
  });

  it("lets a student clear them again", async () => {
    await db.query("update public.profiles set major = 'Math', class_year = 'senior' where id = $1", [me]);
    const { error } = await asUser(me, () =>
      attempt("update public.profiles set major = null, minor = null, class_year = null where id = $1", [me]),
    );
    expect(error).toBeUndefined();
  });

  it("does not let a student change someone else's", async () => {
    const { error, rowCount } = await asUser(me, () =>
      attempt("update public.profiles set major = 'Hijacked', class_year = 'graduate' where id = $1", [other]),
    );
    // RLS hides the row: no error, nothing changed.
    expect(error).toBeUndefined();
    expect(rowCount).toBe(0);
    const { rows } = await db.query("select major, class_year from public.profiles where id = $1", [other]);
    expect(rows).toEqual([{ major: null, class_year: null }]);
  });

  it("still leaves id and created_at unwritable after the wider grant", async () => {
    for (const sql of [
      "update public.profiles set id = gen_random_uuid() where id = $1",
      "update public.profiles set created_at = now() - interval '1 year' where id = $1",
      "update public.profiles set major = 'Math', created_at = now() where id = $1",
    ]) {
      const { error } = await asUser(me, () => attempt(sql, [me]));
      expect(error?.code, sql).toBe("42501");
    }
  });

  it("grants clients UPDATE on exactly display_name and the three new columns", async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'profiles'
        and grantee = 'authenticated' and privilege_type = 'UPDATE'
      order by column_name
    `);
    expect(rows.map((row) => row.column_name)).toEqual(["class_year", "display_name", "major", "minor"]);

    const anon = await db.query(`
      select 1 from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'profiles'
        and grantee = 'anon' and privilege_type in ('UPDATE', 'INSERT')
    `);
    expect(anon.rows).toEqual([]);
  });

  it.each([
    ["empty", "major", ""],
    ["spaces only", "major", "   "],
    ["a leading space", "major", " Math"],
    ["a trailing newline", "minor", "Math\n"],
    ["a no-break space at the end", "minor", "Math "],
    ["81 characters", "major", "x".repeat(81)],
  ])("refuses a %s %s", async (_label, column, value) => {
    const { error } = await attempt(`update public.profiles set ${column} = $2 where id = $1`, [me, value]);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(`"profiles_${column}_check"`);
  });

  it.each([
    ["one character", "x"],
    ["inner spaces", "Medicine, Health, and Society"],
    ["80 characters", "x".repeat(80)],
  ])("accepts %s", async (_label, value) => {
    const { error } = await attempt("update public.profiles set major = $2, minor = $2 where id = $1", [me, value]);
    expect(error).toBeUndefined();
  });

  it("refuses a year the enum does not have", async () => {
    const { error } = await attempt("update public.profiles set class_year = 'fifth_year' where id = $1", [me]);
    expect(error?.code).toBe("22P02");
  });
});

describe("profile_courses (US-11)", () => {
  let courses: string[];

  beforeEach(async () => {
    courses = await createCourses(10);
  });

  it("lets a student add and remove their own current courses", async () => {
    const added = await asUser(me, () =>
      attempt("insert into public.profile_courses (course_id) values ($1), ($2)", [courses[0], courses[1]]),
    );
    expect(added.error).toBeUndefined();

    const { rows } = await db.query("select user_id from public.profile_courses where user_id = $1", [me]);
    // user_id defaulted to the caller.
    expect(rows).toHaveLength(2);

    const removed = await asUser(me, () =>
      attempt("delete from public.profile_courses where user_id = $1 and course_id = $2", [me, courses[0]]),
    );
    expect(removed.rowCount).toBe(1);
  });

  it("lets any signed-in student read anyone's, and a signed-out caller nothing", async () => {
    await db.query("insert into public.profile_courses (user_id, course_id) values ($1, $2)", [other, courses[0]]);

    const read = await asUser(me, () =>
      attempt("select course_id from public.profile_courses where user_id = $1", [other]),
    );
    expect(read.rows).toEqual([{ course_id: courses[0] }]);

    const anon = await asUser(null, () => attempt("select * from public.profile_courses"));
    expect(anon.error?.code).toBe("42501");
  });

  it("does not let a student add a course to someone else's profile", async () => {
    const { error } = await asUser(me, () =>
      attempt("insert into public.profile_courses (user_id, course_id) values ($1, $2)", [other, courses[0]]),
    );
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/row-level security/);
  });

  it("does not let a student remove someone else's", async () => {
    await db.query("insert into public.profile_courses (user_id, course_id) values ($1, $2)", [other, courses[0]]);
    const { error, rowCount } = await asUser(me, () =>
      attempt("delete from public.profile_courses where user_id = $1", [other]),
    );
    expect(error).toBeUndefined();
    expect(rowCount).toBe(0);
  });

  it("refuses UPDATE, a backdated added_at, and TRUNCATE", async () => {
    await db.query("insert into public.profile_courses (user_id, course_id) values ($1, $2)", [me, courses[0]]);
    for (const sql of [
      `update public.profile_courses set course_id = '${courses[1]}' where user_id = '${me}'`,
      `insert into public.profile_courses (course_id, added_at) values ('${courses[2]}', now() - interval '1 year')`,
      "truncate public.profile_courses",
    ]) {
      const { error } = await asUser(me, () => attempt(sql));
      expect(error?.code, sql).toBe("42501");
    }
  });

  it("refuses a signed-out insert", async () => {
    const { error } = await asUser(null, () =>
      attempt("insert into public.profile_courses (user_id, course_id) values ($1, $2)", [me, courses[0]]),
    );
    expect(error?.code).toBe("42501");
  });

  it("stops at 8 courses, but still lets a student at the limit re-save one they have", async () => {
    for (const course of courses.slice(0, 8)) {
      const { error } = await asUser(me, () =>
        attempt("insert into public.profile_courses (course_id) values ($1)", [course]),
      );
      expect(error).toBeUndefined();
    }

    const ninth = await asUser(me, () =>
      attempt("insert into public.profile_courses (course_id) values ($1)", [courses[8]]),
    );
    expect(ninth.error?.code).toBe("P0001");
    expect(ninth.error?.message).toBe("profile_courses_limit");

    const again = await asUser(me, () =>
      attempt("insert into public.profile_courses (course_id) values ($1) on conflict do nothing", [courses[0]]),
    );
    expect(again.error).toBeUndefined();

    // Someone else's count is their own.
    const theirs = await asUser(other, () =>
      attempt("insert into public.profile_courses (course_id) values ($1)", [courses[8]]),
    );
    expect(theirs.error).toBeUndefined();
  });

  it("goes with the account (US-24's cascade)", async () => {
    await db.query("insert into public.profile_courses (user_id, course_id) values ($1, $2)", [me, courses[0]]);
    await db.query("delete from auth.users where id = $1", [me]);
    const { rows } = await db.query("select 1 from public.profile_courses where user_id = $1", [me]);
    expect(rows).toEqual([]);
  });

  it("has RLS on, and nothing granted to anon", async () => {
    const { rows } = await db.query<{ rls: boolean }>(
      "select relrowsecurity as rls from pg_class where oid = 'public.profile_courses'::regclass",
    );
    expect(rows[0].rls).toBe(true);
    const anon = await db.query(
      "select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'profile_courses' and grantee = 'anon'",
    );
    expect(anon.rows).toEqual([]);
  });
});

describe("US-11b: another student's email is never readable", () => {
  it("returns another student's name, major and year -- and no email", async () => {
    await db.query("update public.profiles set major = 'History', class_year = 'senior' where id = $1", [other]);
    const { rows } = await asUser(me, () =>
      attempt("select * from public.profiles where id = $1", [other]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ display_name: "Other", major: "History", class_year: "senior" });
    expect(Object.keys(rows[0]).filter((key) => /mail/i.test(key))).toEqual([]);
    expect(JSON.stringify(rows[0])).not.toContain("@vanderbilt.edu");
  });

  it("refuses a signed-in student auth.users outright", async () => {
    const { error } = await asUser(me, () => attempt("select email from auth.users where id = $1", [other]));
    expect(error?.code).toBe("42501");
  });

  it("has no email column on any table or view the Data API exposes", async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(`
      select table_schema || '.' || table_name as table_name, column_name
      from information_schema.columns
      where table_schema in ('public', 'graphql_public') and column_name ilike '%mail%'
    `);
    expect(rows).toEqual([]);
  });
});
