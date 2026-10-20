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
| BUG-03 | 2026-10-01, writing `tests/db/course-normalization.test.ts` | `get_or_create_course()` (`supabase/migrations/20261001031739_s2_course_normalization.sql`) | High | The function's parameters were named `department_code` and `course_number` — identical to the actual column names on `courses`. Every query inside the function that filtered on those columns raised `column reference "department_code" is ambiguous`, so the function failed on every single call, not just an edge case. | Postgres can't tell a bare identifier apart from a same-named PL/pgSQL parameter when both are in scope. | Renamed the parameters to `p_department_code` / `p_course_number`; updated `createSession()`'s RPC call in `src/app/sessions/actions.ts` to match (Supabase matches RPC arguments by name). In #32, carried by #46; its tests pass against the real local stack (2026-10-11). | 🟡 Fix in review |
| BUG-04 | 2026-10-01, running the full `tests/db/` suite | `tests/db/course-normalization.test.ts` | Medium | A test inserted a throwaway `departments` row directly to set up a foreign key, with no cleanup. It passed alone, but intermittently broke `tests/db/seed.test.ts` — which asserts the department list is *exactly* the seeded set — when the two files ran in parallel and `seed.test.ts` caught the stray row mid-test. | Vitest runs test files in parallel by default; this test's write was visible to every other connection the instant it committed. | Wrapped the test in an explicit transaction (`BEGIN` / `ROLLBACK`) so the row is never actually committed. In #32, carried by #46. | 🟡 Fix in review |
| BUG-05 | 2026-10-06, integration review (#31–#33 merged locally) | `tests/db/auth-fixtures.ts` (#32) | High | Once #33's signup trigger exists, the fixture's plain `insert into profiles` hits a duplicate key, and 21 of #32's database tests fail. Each PR was green on its own. | The fixture assumed nothing else creates a profile row. | Upsert instead of insert (#46). | 🟡 Fix in review |
| BUG-06 | 2026-10-06, integration review | `createSession()` (#32) | Medium | Regenerating `database.types.ts`, which CI requires, makes typecheck and build fail: the form's `room` can be null, but the generated RPC argument is a plain string. | `supabase gen types` marks every function argument non-null. | Pass `room ?? ""`; `create_session` already turns a blank room into null (#46). | 🟡 Fix in review |
| BUG-07 | 2026-10-06, integration review (SQL as `authenticated`) | `create_session`, `departments` INSERT policy (#32) | Medium | A direct RPC call stored a blank topic, a blank location label and a 100,000-character topic; a direct insert stored a 5,000-character department code. | The length limits lived only in `src/lib/limits.ts`, which a direct API call skips. | CHECKs in `*_session_text_limits.sql`, and a department-code limit on the form (#46). | 🟡 Fix in review |
| BUG-08 | 2026-10-06, integration review | Grants on `create_session` and `get_or_create_course` (#32) | Low | `anon` could still execute both functions. Both refuse a signed-out caller, so nothing leaked. | `revoke … from public` does not remove what Supabase's default privileges grant to `anon` directly. | `revoke execute … from anon` (#46). | 🟡 Fix in review |
| BUG-09 | 2026-10-06, integration review; reproduced in the browser 2026-10-11 | Fixture places + `create_session` (#31, #32) | High | Creating a session always fails with "Something went wrong": the stub picker's fixture place ids resolve to location ids that are not rows, so `create_session` fails its foreign key. | Fixture locations are not in any database, and the real picker (M2) needs Google keys (M1). | Decision pending in #36 (M5). | 🔴 Open |
| BUG-10 | 2026-10-08, ICA 10 coverage baseline | `vitest.config.mts` | Medium | Coverage reported 85.7% branch coverage instead of 77.2%: it silently left out `places.ts`, `sessions.ts` and `supabase/admin.ts`. | Those files import `server-only`, which Vitest could not resolve, so coverage dropped them instead of counting them as untested. | `server-only` mapped to Next's empty module (#41). | ✅ Fixed and verified |
| BUG-11 | 2026-10-11, browser review of #42 | Header avatar after the name step (#33, #42) | Low | After choosing a display name the avatar showed "?" until a full reload. | `saveDisplayName()` redirects without revalidating, and a Server Function redirect does not re-render the root layout. | `revalidatePath("/", "layout")` before the redirect (#44). | 🟡 Fix in review |
| BUG-12 | 2026-10-11, browser review of #42 | `AccountSheet` (#42) | Medium | The sign-out sheet opened with focus on Sign out, so Enter straight away signed you out, and Tab left the modal for the page behind it. | A hand-rolled dialog that focused its first action and had no focus trap. | Focus starts on Cancel; Tab and Shift+Tab wrap inside the sheet (#44). | 🟡 Fix in review |
| BUG-13 | 2026-10-11, a teammate's first sign-in on production; found 2026-10-18 | `/auth/confirm` (#33) with Supabase's default email | High | Signing in on production by email never worked: the account was confirmed but never signed in, and the student landed on "link didn't work". | The hosted project sends Supabase's default email (our template is locked until custom SMTP). Its link comes back with a PKCE `code`, and `/auth/confirm` only handled `token_hash`. | `/auth/confirm` exchanges the `code` (A5, #35); checked on a local stack with the default template. | 🟡 Fix in review |
| BUG-14 | 2026-10-18, code review of #73 | `join_session`, `leave_session` (#51) | High | Every call to either function raised `column reference "session_id" is ambiguous` — all 9 of the new database tests failed, the required `db` check included. | Same bug as BUG-03: the `session_id` parameter has the same name as `session_attendees.session_id`, so every unqualified reference inside the function body (the already-joined check, the seat count, the leave DELETE) could mean either. | Qualified every reference with a table alias (`sa.session_id`) instead of renaming the parameter, so the RPC calls' argument names didn't have to change (#73). | 🟡 Fix in review |

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
