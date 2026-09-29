// Builds supabase/seed.sql from data/departments.json and data/courses.json.
// Run with `npm run db:seed`. W3; see data/README.md.
//
// data/ is the source of truth and seed.sql is generated from it, so the two
// can never disagree: CI re-runs this script and fails if the committed
// seed.sql differs from what it produces. The output must therefore be
// deterministic -- rows sorted by plain code-unit comparison (not
// localeCompare, which depends on the machine's locale), no timestamps.
//
// Plain Node, no dependencies. Writes the file only; it never touches a
// database. `npm run db:reset` loads the result.

import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const DEPARTMENTS = "data/departments.json";
const COURSES = "data/courses.json";
const OUTPUT = "supabase/seed.sql";

// The normalised form ADR 0008 describes: uppercase, no whitespace or
// punctuation. S2 owns the real normalisation rule in src/lib/validation.ts;
// the starter data must already be in that form, so this only checks it.
const normalise = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

// The format W3 found in the 2026-27 catalogue: four digits, optionally one
// uppercase letter (W = writing, L = laboratory). See data/README.md. A guard
// against typos in data/, not the app's validation rule -- that is S2's.
const CATALOG_NUMBER = /^[0-9]{4}[A-Z]?$/;

function fail(message) {
  console.error(`build-seed: ${message}`);
  process.exit(1);
}

function readList(path, key) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(new URL(path, root), "utf8"));
  } catch (error) {
    fail(`could not read ${path}: ${error.message}`);
  }
  if (!Array.isArray(parsed?.[key])) {
    fail(`${path} must be an object with a "${key}" array`);
  }
  return parsed[key];
}

function checkKeys(path, row, allowed) {
  const unknown = Object.keys(row).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(`${path}: unknown key(s) ${unknown.join(", ")} in ${JSON.stringify(row)}`);
  }
}

// Optional text: absent or null means "unknown" (better empty than wrong,
// ADR 0006). If present it must be real text.
function optionalText(path, row, key) {
  const value = row[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() !== value || value === "") {
    fail(`${path}: "${key}" must be non-empty text without surrounding spaces in ${JSON.stringify(row)}`);
  }
  return value;
}

// A SQL string literal. Relies on standard_conforming_strings (on by default
// since PostgreSQL 9.1): inside '...' only the quote itself needs escaping,
// and backslashes are literal.
function sqlText(value) {
  if (value === null) return "null";
  if (value.includes("\0")) fail(`NUL character in ${JSON.stringify(value)}`);
  return `'${value.replaceAll("'", "''")}'`;
}

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// --- departments -----------------------------------------------------------

const departments = readList(DEPARTMENTS, "departments").map((row) => {
  checkKeys(DEPARTMENTS, row, ["code", "name"]);
  const { code } = row;
  if (typeof code !== "string" || code === "" || normalise(code) !== code) {
    fail(`${DEPARTMENTS}: code ${JSON.stringify(code)} is not normalised (expected e.g. "CS")`);
  }
  return { code, name: optionalText(DEPARTMENTS, row, "name") };
});
departments.sort((a, b) => byCodeUnits(a.code, b.code));

const codes = new Set();
for (const { code } of departments) {
  if (codes.has(code)) fail(`${DEPARTMENTS}: duplicate code ${code}`);
  codes.add(code);
}

// --- courses ---------------------------------------------------------------

const courses = readList(COURSES, "courses").map((row) => {
  checkKeys(COURSES, row, ["department_code", "number", "title"]);
  const { department_code: department, number } = row;
  if (!codes.has(department)) {
    fail(`${COURSES}: department ${JSON.stringify(department)} is not in ${DEPARTMENTS}`);
  }
  if (typeof number !== "string" || normalise(number) !== number || !CATALOG_NUMBER.test(number)) {
    fail(`${COURSES}: ${department} number ${JSON.stringify(number)} is not a normalised catalogue number (expected e.g. "3251" or "2100W")`);
  }
  return { department, number, title: optionalText(COURSES, row, "title") };
});
courses.sort(
  (a, b) => byCodeUnits(a.department, b.department) || byCodeUnits(a.number, b.number),
);

const seen = new Set();
for (const { department, number } of courses) {
  const key = `${department} ${number}`;
  if (seen.has(key)) fail(`${COURSES}: duplicate course ${key}`);
  seen.add(key);
}

// --- output ----------------------------------------------------------------

// One insert per table; omitted when the table has no rows, since
// `insert ... values` with an empty list is not valid SQL.
function insert(table, columns, rows, conflict) {
  if (rows.length === 0) return "";
  const lines = rows.map((row) => `  (${row.join(", ")})`).join(",\n");
  return `\ninsert into public.${table} (${columns}) values\n${lines}\non conflict (${conflict}) do nothing;\n`;
}

const sql = `-- GENERATED by scripts/build-seed.mjs from ${DEPARTMENTS} and ${COURSES}.
-- DO NOT EDIT. Change the JSON, then run \`npm run db:seed\` and commit both.
-- CI regenerates this file and fails if it differs from what is committed.
--
-- Starter data only (W3, ADR 0008): a handful of departments and courses so
-- the pickers are not empty. Users add the rest. Seeded rows have no
-- created_by. Loaded by \`supabase db reset\` locally; the hosted project
-- needs \`supabase db push --include-seed\` (see the root README).
--
-- \`on conflict do nothing\` makes re-running this harmless, including
-- against a database where users have already created some of these rows.
-- It also means a changed name or title here does not overwrite an existing
-- row.
${insert(
  "departments",
  "code, name",
  departments.map((d) => [sqlText(d.code), sqlText(d.name)]),
  "code",
)}${insert(
  "courses",
  "department_code, number, title",
  courses.map((c) => [sqlText(c.department), sqlText(c.number), sqlText(c.title)]),
  "department_code, number",
)}`;

writeFileSync(new URL(OUTPUT, root), sql);
console.log(
  `build-seed: wrote ${OUTPUT} (${departments.length} departments, ${courses.length} courses)`,
);
