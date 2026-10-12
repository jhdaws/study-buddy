import type { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * S2 -- normalize_department_code(), normalize_course_number(),
 * get_or_create_course(), and the RLS beside them
 * (supabase/migrations/20261001031739_s2_course_normalization.sql).
 *
 * Passing (3/3 clean runs) against a hand-built plain-Postgres stand-in for
 * Supabase -- no Docker in the environment that wrote this, so not the real
 * local stack. Run `npm run db:start && npm run test:db` for real before
 * trusting this further -- see HANDOFF.md. This file caught a real bug on
 * the way: get_or_create_course's parameters originally shadowed column
 * names of the same thing (department_code, number), which made every
 * lookup query raise "column reference is ambiguous" -- see the migration's
 * own comment.
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

async function getOrCreateCourse(db: Client, departmentCode: string, courseNumber: string) {
  return db.query<{ get_or_create_course: string }>(
    "select public.get_or_create_course($1, $2)",
    [departmentCode, courseNumber],
  );
}

describe("normalize_department_code / normalize_course_number (S2)", () => {
  it.each([
    ["cs", "CS"],
    [" CS ", "CS"],
    ["C.S.", "CS"],
  ])("normalize_department_code(%j) -> %j", async (raw, expected) => {
    const db = await connection();
    const { rows } = await db.query("select public.normalize_department_code($1) as v", [raw]);
    expect(rows[0].v).toBe(expected);
  });

  it.each([
    ["3251", "3251"],
    ["cs-3251", "CS3251"],
    ["3251w", "3251W"],
  ])("normalize_course_number(%j) -> %j", async (raw, expected) => {
    const db = await connection();
    const { rows } = await db.query("select public.normalize_course_number($1) as v", [raw]);
    expect(rows[0].v).toBe(expected);
  });
});

describe("get_or_create_course (S2, US-02; data/README.md)", () => {
  it("rejects when no one is signed in", async () => {
    const db = await connection();
    await expect(getOrCreateCourse(db, "CS", "9999")).rejects.toThrow(/not_signed_in/);
  });

  it("rejects a course number that is not four digits plus an optional letter", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    for (const courseNumber of ["325", "32511", "3251WW"]) {
      await expect(getOrCreateCourse(db, "CS", courseNumber)).rejects.toThrow(
        /invalid_course_number/,
      );
    }
  });

  it("rejects a department code that normalises to nothing", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    await expect(getOrCreateCourse(db, "--", "9999")).rejects.toThrow(/department_required/);
  });

  it("creates the department and course on first use, attributed to the caller", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);

    const result = await getOrCreateCourse(db, "newdept", "9999w");
    const courseId = result.rows[0].get_or_create_course;
    expect(courseId).toBeTruthy();

    const course = await db.query(
      "select department_code, number, created_by from public.courses where id = $1",
      [courseId],
    );
    expect(course.rows).toEqual([
      { department_code: "NEWDEPT", number: "9999W", created_by: userId },
    ]);

    const department = await db.query(
      "select code, created_by from public.departments where code = $1",
      ["NEWDEPT"],
    );
    expect(department.rows).toEqual([{ code: "NEWDEPT", created_by: userId }]);
  });

  it("is idempotent: punctuation and case variants of the same course resolve to one row", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);

    const first = await getOrCreateCourse(db, "cs", "3251");
    const second = await getOrCreateCourse(db, " CS ", "3251");
    const third = await getOrCreateCourse(db, "C.S.", "3251");

    const ids = [first, second, third].map((r) => r.rows[0].get_or_create_course);
    expect(new Set(ids).size).toBe(1);

    const courses = await db.query(
      "select count(*)::int as n from public.courses where department_code = 'CS' and number = '3251'",
    );
    expect(courses.rows[0].n).toBe(1);
  });

  it("lets a second student's use of an existing course not re-attribute it", async () => {
    // Two connections, not one: signInAs() sets role authenticated, which
    // (correctly, per the RLS below) cannot itself insert into auth.users --
    // only a fresh, still-superuser connection can create the next fixture
    // user.
    const first = await createUser(await connection(), { displayName: "Jamie Host" });
    const firstDb = await connection();
    await signInAs(firstDb, first);
    const firstCall = await getOrCreateCourse(firstDb, "CS", "9201");

    const second = await createUser(await connection(), { displayName: "Alex Student" });
    const secondDb = await connection();
    await signInAs(secondDb, second);
    const secondCall = await getOrCreateCourse(secondDb, "cs", "9201");

    expect(secondCall.rows[0].get_or_create_course).toBe(firstCall.rows[0].get_or_create_course);

    const course = await firstDb.query(
      "select created_by from public.courses where id = $1",
      [firstCall.rows[0].get_or_create_course],
    );
    expect(course.rows[0].created_by).toBe(first);
  });
});

describe("RLS on departments and courses (S2)", () => {
  it("lets any signed-in user read departments and courses", async () => {
    const writer = await connection();
    const writerId = await createUser(writer, { displayName: "Jamie Host" });
    await signInAs(writer, writerId);
    await getOrCreateCourse(writer, "RLS", "1000");

    const reader = await connection();
    const readerId = await createUser(reader, { displayName: "Alex Reader" });
    await signInAs(reader, readerId);

    const departments = await reader.query("select code from public.departments where code = $1", [
      "RLS",
    ]);
    expect(departments.rows).toEqual([{ code: "RLS" }]);
  });

  it("hides departments and courses from a connection with no signed-in user", async () => {
    const writer = await connection();
    const writerId = await createUser(writer, { displayName: "Jamie Host" });
    await signInAs(writer, writerId);
    await getOrCreateCourse(writer, "HIDDEN", "1000");

    const anon = await connection();
    await anon.query("set role anon");
    const departments = await anon.query(
      "select code from public.departments where code = $1",
      ["HIDDEN"],
    );
    expect(departments.rows).toEqual([]);
  });

  it("refuses a direct INSERT claiming someone else as the creator", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    const someoneElse = await createUser(db, { displayName: "Not You" });
    await signInAs(db, userId);

    await expect(
      db.query("insert into public.departments (code, created_by) values ($1, $2)", [
        "IMPOSTOR",
        someoneElse,
      ]),
    ).rejects.toThrow();
  });

  it("refuses an UPDATE or DELETE -- merging is not a client write", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    await getOrCreateCourse(db, "NOEDIT", "1000");

    // Unlike a missing INSERT policy -- whose WITH CHECK fails against the
    // row being inserted and so raises an explicit error -- a missing
    // UPDATE/DELETE policy has no row to apply USING to: RLS filters the
    // target row out before the command ever sees it, so the statement
    // succeeds but matches zero rows. No error either way; this is the
    // actual shape "no client writes" takes for these two.
    const updated = await db.query(
      "update public.departments set name = 'Hacked' where code = 'NOEDIT'",
    );
    expect(updated.rowCount).toBe(0);

    const deleted = await db.query("delete from public.departments where code = 'NOEDIT'");
    expect(deleted.rowCount).toBe(0);

    const stillThere = await db.query(
      "select code, name from public.departments where code = 'NOEDIT'",
    );
    expect(stillThere.rows).toEqual([{ code: "NOEDIT", name: null }]);
  });
});

describe("CHECK constraints pin the normalised shape (S2)", () => {
  it("rejects a department code inserted directly, unnormalised", async () => {
    const db = await connect();
    try {
      await expect(
        db.query("insert into public.departments (code) values ('not-normal')"),
      ).rejects.toThrow(/departments_code_normalised/);
    } finally {
      await db.end();
    }
  });

  it("rejects a course number inserted directly, unnormalised", async () => {
    const db = await connect();
    try {
      // In an explicit transaction, rolled back at the end: the parent
      // department row this needs must exist, but must not actually commit
      // -- tests/db/seed.test.ts runs concurrently against the same
      // database and asserts departments is *exactly* the seeded set.
      await db.query("begin");
      await db.query(
        "insert into public.departments (code) values ('CHK') on conflict do nothing",
      );
      await expect(
        db.query(
          "insert into public.courses (department_code, number) values ('CHK', 'not-normal')",
        ),
      ).rejects.toThrow(/courses_number_normalised/);
    } finally {
      await db.query("rollback").catch(() => {});
      await db.end();
    }
  });
});
