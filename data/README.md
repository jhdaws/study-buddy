# Reference data

Starter data loaded into the database by `supabase/seed.sql`. Empty until W3
adds it. Decided in [ADR 0008](../docs/adr/0008-sprint-2-schema-decisions.md),
which amends ADRs 0006 and 0007.

## Departments and courses — a handful seeded, the rest learned from use

- **A starter set only:** roughly ten departments the team actually takes,
  and a few course numbers in each. **W3** adds them here and builds
  `supabase/seed.sql` from them. There is no full department list to
  compile — TASK-02 was reduced to this.

- **Students add the rest, departments included.** A student picks a
  department — or adds one — and types a course number; the first person to
  use a course creates it, and it becomes a suggestion for everyone after.
  Normalisation (S2) makes `cs`, ` CS ` and `C.S.` one department, and
  `CS-3251` and `CS 3251` one course.

- **Duplicates are an accepted risk.** Nothing stops `COMPSCI` being added
  alongside `CS`. Usage ranking floats the real one, and `merged_into` on
  both tables lets duplicates be collapsed later without a migration.

- **Course-number format** (four digits? a letter suffix?) is checked by W3
  and encoded by S2. Check it against the catalogue, not memory.

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
