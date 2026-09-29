# Reference data

Starter data for the database. Decided in
[ADR 0008](../docs/adr/0008-sprint-2-schema-decisions.md), which amends ADRs
0006 and 0007.

| File | What |
| --- | --- |
| `departments.json` | 10 departments: `code` and `name` |
| `courses.json` | 27 courses, 2–4 per department: `department_code`, `number`, and `title` |

**These files are the source of truth; `supabase/seed.sql` is generated from
them.** To change the starter data:

```bash
# edit data/departments.json or data/courses.json, then
npm run db:seed     # rewrites supabase/seed.sql (never touches a database)
npm run db:reset    # reloads the local database, seed included
```

Commit the JSON and `seed.sql` together. CI regenerates `seed.sql` and fails
if the committed one differs. `scripts/build-seed.mjs` also refuses data that
is not already normalised, a course whose department is missing, duplicates,
and unknown keys.

`title` and `name` are optional. Leave one out rather than guess — better
empty than wrong (ADR 0006).

## Departments and courses — a handful seeded, the rest learned from use

- **A starter set only** (W3; TASK-02 was reduced to this). Chosen as what a
  CS 4278 team plausibly takes: BSCI, CHEM, CS, DS, ECE, ECON, ES, MATH, PHYS,
  PSY, with a few courses each — including CS 4278 itself and one
  letter-suffixed course of each kind (`1601L`, `2100W`).

- **Students add the rest, departments included.** A student picks a
  department — or adds one — and types a course number; the first person to
  use a course creates it, and it becomes a suggestion for everyone after.
  Normalisation (S2) makes `cs`, ` CS ` and `C.S.` one department, and
  `CS-3251` and `CS 3251` one course.

- **Duplicates are an accepted risk.** Nothing stops `COMPSCI` being added
  alongside `CS`. Usage ranking floats the real one, and `merged_into` on
  both tables lets duplicates be collapsed later without a migration.

### Where the data came from

The **Vanderbilt Undergraduate Catalog 2026-27**, read on 2026-09-29 through
the catalogue's public course API:
`https://vanderbilt.kuali.co/api/v1/catalog/courses/69861616dc1d2450f8837f3a`
(the list of catalogues, with their ids, is at
`https://vanderbilt.kuali.co/api/v1/catalog/public/catalogs`). No login is
needed.

- Department codes and names are the catalogue's subject codes and subject
  descriptions, verbatim — hence `Psychology (AS)`, which the catalogue uses
  to tell it apart from Peabody's `PSY-PC`.
- Every course number and title was checked against the API by script. All
  titles are verbatim except **ES 1401**, where the catalogue's
  `Module1` is written `Module 1`, matching Modules 2 and 3.
- Only the numbers and titles were checked, not what the courses cover or
  whether they run this term.

## For S2: what the catalogue says about the format

Checked against the catalogue data, not from memory. **Verified** for the
2026-27 undergraduate catalogue, and spot-checked against the 2025-26
undergraduate and 2026-27 graduate catalogues.

**Course numbers are four digits, optionally followed by one uppercase
letter.**

| Catalogue | Courses | Four digits | Four digits + letter |
| --- | --- | --- | --- |
| Undergraduate 2026-27 | 3,407 | 3,119 | 286 — `W` 228, `L` 58 |
| Undergraduate 2025-26 | 3,705 | 3,366 | 337 |
| Graduate 2026-27 | 2,162 | 2,155 | 7 — all `L` |

- No three- or five-digit numbers, no other letters, no letter prefixes.
  (Two undergraduate entries, `ULAW 2440` and `ULAW 2542`, carry a trailing
  space in the catalogue's own id — whitespace, not a format.)
- `W` marks a writing-intensive course (`ES 2100W`), `L` a laboratory
  (`PHYS 1601L`). **The suffix is part of the number:** `CHEM 1601` and
  `CHEM 1601L` are different courses, so normalisation must keep it.
- The catalogue always writes the suffix uppercase. Normalisation should
  uppercase it too, or `2100w` and `2100W` become two courses.
- After normalisation, `^[0-9]{4}[A-Z]?$` matches every number seen. Whether
  to reject anything else, or only warn, is S2's call.

**Department codes are 2–5 uppercase letters — with six exceptions.** Of 162
subject codes in the 2026-27 undergraduate catalogue, six contain a hyphen:
`ES-NYC`, `HIST-NYC`, `INDS-NYC`, `MS-PC`, `NS-PC`, `PSY-PC`. Stripping
punctuation turns `PSY-PC` into `PSYPC`: still distinct from `PSY`, but not
how the catalogue writes it. None of the six is seeded. S2 decides.

**Two traps the schema does not handle:**

- **`EECE` is now `ECE`.** The current catalogue has no `EECE`; some
  department PDFs still use it (the School of Engineering's 2025-26 CS
  prerequisite sheet says "CS 2231 or EECE 2123"). Expect students to add
  `EECE` — the synonym case ADR 0008 accepts, and a `merged_into` candidate.
- **Cross-listed courses have two codes.** `CS 4278` and `ECE 4278` are the
  same class, as are `CS 2201`/`ECE 2201`, `CS 3251`/`ECE 3251`,
  `CS 2123`/`ECE 2123`, `CS 2281`/`ECE 2281`, and `CS 3262`/`DS 3262` (same
  number and title in the catalogue; the CS prerequisite sheet writes them
  `CS/ECE 2201`). Each would be a separate `courses` row, so sessions for one
  class can split between them. The seed has one side of five of these
  (`CS 2201`, `CS 3251`, `CS 4278`, `ECE 2123`, `ECE 2281`). Not solved here.

## Locations — nothing seeded

There is **no curated building list**. Every location, campus buildings
included, comes from Google Places at session-creation time, through
Autocomplete restricted to a radius around campus. TASK-01 (curating
buildings) and TASK-07 (asking VU for campus GIS data) were dropped.

When a host picks a place, the server looks it up, checks the radius and
place type, and stores the `place_id` with the coordinates it validated. The
place's name is not stored in `locations`: whether Google's terms allow
caching it is unverified (M1). The host's editable label is stored on the
session instead.

### The constraint that does not change

**No free-form address entry.** Selection is limited to public places inside
the radius, of place types that exclude residences, and the radius is
re-checked on the server — the autocomplete filter is a UX convenience, not a
control.

This platform sends students to meet people they do not know, in person.
Arbitrary address input means someone can post a session at a private
residence. Related: US-18, US-22, US-23.
