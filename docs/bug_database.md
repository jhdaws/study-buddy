# Bug database

We didn't have one of these. Bugs we found got written up in `HANDOFF.md`
entries or `docs/ai-usage-log.md` rows and then scrolled out of view — useful
at the time, easy to lose track of afterward. This file is the index: one row
per bug, however small, so the team (and whoever's grading this) can see what
broke, how it was caught, and whether it's actually fixed.

**This is not a duplicate of `test-cases.md`.** That file tracks acceptance
criteria — whether a user story is proven to work. This file tracks defects —
specific things that were wrong, found however they were found (a test, a
manual click-through, a code review, a teammate noticing something odd).

## How to log one

Add a row to the table below when a bug is found — not just when it's fixed.
An open row is useful too: it tells the next person not to rediscover it.

| Field | What goes there |
| --- | --- |
| ID | `BUG-nn`, sequential |
| Found | Date, and how (a test failing, manual testing, code review, production) |
| Area | File, feature, or track |
| Severity | **High** — wrong data, security, or a broken core flow · **Medium** — a real defect with a workaround · **Low** — cosmetic or edge-case |
| Description | What was actually wrong, in one or two sentences |
| Root cause | Why it happened, if known |
| Fix | What changed, and where (file, migration, PR) |
| Status | 🔴 Open · 🟡 Fix in review · ✅ Fixed and verified |

Link back to the PR, migration, or `HANDOFF.md` entry where the fix actually
happened — this file is the index, not the full writeup.

## Log

| ID | Found | Area | Severity | Description | Root cause | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-01 | 2026-09-28, code review | `profiles` RLS policy (early scaffold) | High | A Row Level Security policy correctly restricted which *rows* of `profiles` a student could read, but RLS is row-level, not column-level — every student could still read every other student's email address through the same policy. | The policy only ever controlled row visibility; nothing restricted which columns came back. | Removed email from `profiles` entirely rather than patching it with a column grant — it already lives in `auth.users`, which clients can't read at all (ADR 0008 rule 16). Tracked as US-25. | ✅ Fixed and verified |
| BUG-02 | 2026-09-29, manual check before shipping | `src/lib/datetime-local.ts` (campus-time conversion) | Medium | The first version of the Nashville-time conversion was wrong across the autumn daylight-saving change: a session typed for 3:00 AM came out stored as 2:00 AM. | DST transitions aren't a fixed offset — the conversion needs to resolve which side of the transition a local time falls on, not just apply `America/Chicago` blindly. | Rewrote the conversion to handle both DST transitions explicitly; added tests across four machine time zones and both 2026 transitions. | ✅ Fixed and verified |
| BUG-03 | 2026-10-01, writing `tests/db/course-normalization.test.ts` | `get_or_create_course()` (`supabase/migrations/20261001031739_s2_course_normalization.sql`) | High | The function's parameters were named `department_code` and `course_number` — identical to the actual column names on `courses`. Every query inside the function that filtered on those columns raised `column reference "department_code" is ambiguous`, so the function failed on every single call, not just an edge case. | Postgres can't tell a bare identifier apart from a same-named PL/pgSQL parameter when both are in scope. | Renamed the parameters to `p_department_code` / `p_course_number`; updated `createSession()`'s RPC call in `src/app/sessions/actions.ts` to match (Supabase matches RPC arguments by name). | ✅ Fixed and verified |
| BUG-04 | 2026-10-01, running the full `tests/db/` suite | `tests/db/course-normalization.test.ts` | Medium | A test inserted a throwaway `departments` row directly to set up a foreign key, with no cleanup. It passed alone, but intermittently broke `tests/db/seed.test.ts` — which asserts the department list is *exactly* the seeded set — when the two files ran in parallel and `seed.test.ts` caught the stray row mid-test. | Vitest runs test files in parallel by default; this test's write was visible to every other connection the instant it committed. | Wrapped the test in an explicit transaction (`BEGIN` / `ROLLBACK`) so the row is never actually committed. | ✅ Fixed and verified |

## Not a bug, but worth knowing

Some findings aren't defects in our code — they're easy-to-miss facts about
how the tools behave, discovered while debugging something else. Worth a
line here so nobody re-derives them the hard way, even though there's no fix
to track:

- **A missing RLS `UPDATE`/`DELETE` policy fails silently, not loudly.** An
  `INSERT` with no matching policy raises an explicit error (its `WITH CHECK`
  fails against the new row). An `UPDATE` or `DELETE` with no policy instead
  just matches **zero rows** — the statement succeeds, nothing happens, no
  error. Found while testing `departments`/`courses`' read-and-create-only
  policies (`tests/db/course-normalization.test.ts`).
