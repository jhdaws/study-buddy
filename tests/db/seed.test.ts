import { readFileSync } from "node:fs";

import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * The starter data (W3) is in the database, exactly as data/ describes it,
 * and already in normalised form.
 *
 * `supabase db reset` and a fresh `supabase db start` both load
 * supabase/seed.sql, which scripts/build-seed.mjs generates from data/. CI
 * separately checks that seed.sql matches data/; this checks that what
 * reaches the database matches too.
 *
 * Seeded rows are the ones with no `created_by`. Rows students add carry
 * their creator, so this still passes on a local database that has been used
 * -- unless a creator deleted their account, which nulls `created_by`. After
 * `npm run db:reset` that cannot be the case.
 */

type Department = { code: string; name?: string | null };
type Course = { department_code: string; number: string; title?: string | null };

function readData<T>(file: string, key: string): T[] {
  const url = new URL(`../../data/${file}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"))[key];
}

const departments = readData<Department>("departments.json", "departments");
const courses = readData<Course>("courses.json", "courses");

// Plain code-unit order, matching `collate "C"` in the queries below. The
// database's default collation is locale-aware and could order differently.
const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ADR 0008's normalised form: uppercase, no whitespace or punctuation. S2
// owns the real rule; when it lands, this should agree with it.
const NORMALISED = "^[A-Z0-9]+$";
// The course-number format found in the 2026-27 catalogue (data/README.md):
// four digits and an optional uppercase letter suffix, e.g. 3251, 2100W.
const CATALOG_NUMBER = "^[0-9]{4}[A-Z]?$";

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

describe("starter data (seed)", () => {
  it("loads every department in data/departments.json, and nothing else", async () => {
    const { rows } = await db.query<{ code: string; name: string | null }>(`
      select code, name from public.departments
      where created_by is null
      order by code collate "C"
    `);

    const expected = departments
      .map((d) => ({ code: d.code, name: d.name ?? null }))
      .sort((a, b) => byCodeUnits(a.code, b.code));

    // Guards against a vacuous pass if both sides were empty.
    expect(expected.length).toBeGreaterThan(0);
    expect(rows).toEqual(expected);
  });

  it("loads every course in data/courses.json, and nothing else", async () => {
    const { rows } = await db.query<{
      department_code: string;
      number: string;
      title: string | null;
    }>(`
      select department_code, number, title from public.courses
      where created_by is null
      order by department_code collate "C", number collate "C"
    `);

    const expected = courses
      .map((c) => ({ department_code: c.department_code, number: c.number, title: c.title ?? null }))
      .sort(
        (a, b) =>
          byCodeUnits(a.department_code, b.department_code) || byCodeUnits(a.number, b.number),
      );

    expect(expected.length).toBeGreaterThan(0);
    expect(rows).toEqual(expected);
  });

  it("stores seeded department codes in normalised form", async () => {
    const { rows } = await db.query<{ code: string }>(
      `select code from public.departments
       where created_by is null and code !~ $1
       order by code`,
      [NORMALISED],
    );
    expect(rows.map((r) => r.code), "department codes not normalised").toEqual([]);
  });

  it("stores seeded course numbers in normalised catalogue form", async () => {
    const { rows } = await db.query<{ course: string }>(
      `select department_code || ' ' || number as course from public.courses
       where created_by is null and (number !~ $1 or number !~ $2)
       order by 1`,
      [NORMALISED, CATALOG_NUMBER],
    );
    expect(rows.map((r) => r.course), "course numbers not normalised").toEqual([]);
  });
});
