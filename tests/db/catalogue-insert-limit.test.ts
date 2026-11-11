import { randomUUID } from "node:crypto";

import type { Client, DatabaseError } from "pg";
import { afterEach, describe, expect, it } from "vitest";

import { CATALOGUE_INSERTS_PER_DAY, CATALOGUE_INSERTS_PER_HOUR } from "../../src/lib/limits";
import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * SEC-03 (threat model T5) -- the per-student cap on new departments and
 * courses (supabase/migrations/*_catalogue_insert_limit.sql).
 *
 * Every insert here is what a direct `POST /rest/v1/departments` does: the
 * signed-in student's own INSERT, through S2's policy. Rows commit (other
 * files share this database), so every department code is random and every
 * test uses fresh students, whose counts start at zero.
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

/** A department code no earlier run has used: Q + 7 hex digits, uppercased. */
function newCode(): string {
  return `Q${randomUUID().replaceAll("-", "").slice(0, 7).toUpperCase()}`;
}

/** A new student, and a connection signed in as them. */
async function student(): Promise<{ id: string; db: Client }> {
  const id = await createUser(await connection(), { displayName: "Limit Tester" });
  const db = await connection();
  await signInAs(db, id);
  return { id, db };
}

function addDepartment(db: Client, createdBy: string, code = newCode()) {
  return db.query("insert into public.departments (code, created_by) values ($1, $2)", [
    code,
    createdBy,
  ]);
}

function addCourse(db: Client, createdBy: string, departmentCode: string, number: string) {
  return db.query(
    "insert into public.courses (department_code, number, created_by) values ($1, $2, $3)",
    [departmentCode, number, createdBy],
  );
}

async function addDepartments(db: Client, createdBy: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) await addDepartment(db, createdBy);
}

/** Moves every department `createdBy` added back in time, as an admin. */
async function backdateDepartments(createdBy: string, interval: string): Promise<void> {
  const admin = await connection();
  await admin.query(
    "update public.departments set created_at = now() - $2::interval where created_by = $1",
    [createdBy, interval],
  );
}

function getOrCreateCourse(db: Client, departmentCode: string, courseNumber: string) {
  return db.query<{ id: string }>("select public.get_or_create_course($1, $2) as id", [
    departmentCode,
    courseNumber,
  ]);
}

async function refusal(promise: Promise<unknown>): Promise<DatabaseError> {
  const error = await promise.then(
    () => null,
    (reason: DatabaseError) => reason,
  );
  expect(error, "expected the insert to be refused").not.toBeNull();
  return error as DatabaseError;
}

async function departmentCount(createdBy: string): Promise<number> {
  const admin = await connection();
  const { rows } = await admin.query<{ n: number }>(
    "select count(*)::int as n from public.departments where created_by = $1",
    [createdBy],
  );
  return rows[0].n;
}

describe("catalogue insert limit: per hour (SEC-03)", () => {
  it(`allows ${CATALOGUE_INSERTS_PER_HOUR} new departments an hour and refuses the next with catalogue_limit_reached`, async () => {
    const { id, db } = await student();
    await addDepartments(db, id, CATALOGUE_INSERTS_PER_HOUR);

    const error = await refusal(addDepartment(db, id));
    expect(error.message).toBe("catalogue_limit_reached");
    expect(error.code).toBe("PT429"); // PostgREST answers HTTP 429
    expect(await departmentCount(id)).toBe(CATALOGUE_INSERTS_PER_HOUR);
  });

  it("counts courses separately from departments, with the same cap", async () => {
    const { id, db } = await student();
    const department = newCode();
    await addDepartment(db, id, department);

    for (let i = 0; i < CATALOGUE_INSERTS_PER_HOUR; i++) {
      await addCourse(db, id, department, String(1000 + i));
    }
    const error = await refusal(addCourse(db, id, department, "1999"));
    expect(error.message).toBe("catalogue_limit_reached");

    // The course cap says nothing about departments: this student has added one.
    await addDepartment(db, id);
  });

  it("counts each student separately", async () => {
    const first = await student();
    await addDepartments(first.db, first.id, CATALOGUE_INSERTS_PER_HOUR);
    await refusal(addDepartment(first.db, first.id));

    const second = await student();
    await expect(addDepartment(second.db, second.id)).resolves.toMatchObject({ rowCount: 1 });
  });

  it("does not count rows older than the hour", async () => {
    const { id, db } = await student();
    await addDepartments(db, id, CATALOGUE_INSERTS_PER_HOUR);
    await backdateDepartments(id, "61 minutes");

    await expect(addDepartment(db, id)).resolves.toMatchObject({ rowCount: 1 });
  });

  it("ignores a created_at the student sends: a row cannot be backdated out of the window", async () => {
    const { id, db } = await student();
    for (let i = 0; i < CATALOGUE_INSERTS_PER_HOUR; i++) {
      await db.query(
        "insert into public.departments (code, created_by, created_at) values ($1, $2, '2000-01-01')",
        [newCode(), id],
      );
    }

    const error = await refusal(addDepartment(db, id));
    expect(error.message).toBe("catalogue_limit_reached");
  });
});

describe("catalogue insert limit: per day (SEC-03)", () => {
  it(`refuses department ${CATALOGUE_INSERTS_PER_DAY + 1} within a day, even spread over hours, and forgets rows a day old`, async () => {
    const { id, db } = await student();
    // Three hours' worth, each moved out of the hourly window in turn.
    for (let added = 0; added < CATALOGUE_INSERTS_PER_DAY; added += CATALOGUE_INSERTS_PER_HOUR) {
      await addDepartments(db, id, CATALOGUE_INSERTS_PER_HOUR);
      await backdateDepartments(id, "2 hours");
    }

    const error = await refusal(addDepartment(db, id));
    expect(error.message).toBe("catalogue_limit_reached");

    await backdateDepartments(id, "25 hours");
    await expect(addDepartment(db, id)).resolves.toMatchObject({ rowCount: 1 });
  });
});

describe("catalogue insert limit and get_or_create_course (SEC-03, S2)", () => {
  it("still creates a new course and department, attributed to the caller", async () => {
    const { id, db } = await student();
    const department = newCode();

    const { rows } = await getOrCreateCourse(db, department.toLowerCase(), "2100w");

    const admin = await connection();
    const course = await admin.query(
      "select department_code, number, created_by from public.courses where id = $1",
      [rows[0].id],
    );
    expect(course.rows).toEqual([{ department_code: department, number: "2100W", created_by: id }]);
  });

  it("lets a student at the limit still pick a course that already exists", async () => {
    const { db } = await student();
    const department = newCode();
    for (let i = 0; i < CATALOGUE_INSERTS_PER_HOUR; i++) {
      await getOrCreateCourse(db, department, String(2000 + i));
    }

    // Seeded (data/courses.json): ON CONFLICT DO NOTHING, nothing new to count.
    const existing = await getOrCreateCourse(db, "cs", "3251");
    expect(existing.rows[0].id).toBeTruthy();
    // One this student added earlier in the hour, too.
    const own = await getOrCreateCourse(db, department, "2000");
    expect(own.rows[0].id).toBeTruthy();

    const error = await refusal(getOrCreateCourse(db, department, "2999"));
    expect(error.message).toBe("catalogue_limit_reached");
  });

  it("rolls back the new department when the course behind it is refused", async () => {
    const { id, db } = await student();
    const department = newCode();
    for (let i = 0; i < CATALOGUE_INSERTS_PER_HOUR; i++) {
      await getOrCreateCourse(db, department, String(3000 + i));
    }

    const orphan = newCode();
    await refusal(getOrCreateCourse(db, orphan, "1000"));

    const admin = await connection();
    const { rows } = await admin.query("select 1 from public.departments where code = $1", [
      orphan,
    ]);
    expect(rows).toEqual([]);
    expect(await departmentCount(id)).toBe(1);
  });
});

describe("catalogue insert limit under concurrency (SEC-03)", () => {
  it("lets only one of two simultaneous inserts take the last slot", async () => {
    const { id, db: a } = await student();
    await addDepartments(a, id, CATALOGUE_INSERTS_PER_HOUR - 1);

    const b = await connection();
    await signInAs(b, id);
    const bPid = (await b.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;

    // A takes the last slot and holds its transaction open...
    await a.query("begin");
    await addDepartment(a, id);

    // ...while B tries for one more. B must wait for A, not count without it.
    await b.query("begin");
    const bInsert = addDepartment(b, id).then(
      () => null,
      (reason: DatabaseError) => reason,
    );

    const watcher = await connection();
    await expect
      .poll(
        async () =>
          (
            await watcher.query<{ n: number }>(
              `select count(*)::int as n from pg_locks
               where pid = $1 and locktype = 'advisory' and not granted`,
              [bPid],
            )
          ).rows[0].n,
        { timeout: 2_000 },
      )
      .toBeGreaterThan(0);

    await a.query("commit");
    const error = await bInsert;
    await b.query("rollback");

    expect(error?.message).toBe("catalogue_limit_reached");
    expect(await departmentCount(id)).toBe(CATALOGUE_INSERTS_PER_HOUR);
  });
});
