# Acceptance criteria (Given / When / Then)

Every case cites a story ID from [`backlog.md`](./backlog.md) and names how it
will be verified. In the report's Part C these IDs did not match Part A — that
is fixed here.

Once tests exist, the "Verified by" column should name the actual file, so the
mapping stays honest as the code changes.

Status: ⬜ not yet written · 🚧 partially covered · ✅ automated and passing

**Everything is ⬜ except US-01, US-01b, US-02b, US-16 and US-21, which are
🚧.** None of the sign-in rows has run against Supabase: the A3 tests mock it,
and US-01b's database test has not yet run on a Supabase database. An earlier
scaffold had 15 passing unit tests; it was stripped back so the schema can be
designed first. The tests in the repo today cover environment configuration,
the form validation rules, the W4 fixtures and the location picker's props,
the W5 screens as components (session card, list, empty state, create form,
header) and their time formatting, prove the database harness works, guard
that every table has Row Level Security enabled, and check the starter data
loaded. Only the validation tests and the W5 component tests touch a row
below, and neither completes one: **the UI runs on fixture stubs, so no
acceptance criterion is verified end to end.**

| ID | Status | Given | When | Then | Verified by |
| --- | --- | --- | --- | --- | --- |
| US-01 | 🚧 | An unregistered student is on the sign-in screen | They submit a valid `@vanderbilt.edu` address | A one-time sign-in link is emailed; non-Vanderbilt addresses are rejected with a specific message | Unit test + a database-level domain check. **So far (A3, mocked Supabase):** `src/app/login/actions.test.ts` — `signIn` refuses other domains before calling Supabase, sends with `emailRedirectTo` back to `/auth/confirm` on the same origin, maps errors; `verifyCode` signs in with the emailed code; `src/app/auth/confirm/route.test.ts` — the link's token is verified and the redirect never leaves the site; `src/components/SignInForm.test.tsx` — the form, its errors and the code step. A4: `src/lib/supabase/server.test.ts` (`requireUser`, the name step), `src/lib/supabase/proxy.test.ts` (signed-out visitors leave `/sessions*` with `?next=`, cookies kept), `DisplayNameForm.test.tsx` and `saveDisplayName` in `actions.test.ts`. **Not yet:** an email actually sent and clicked — nothing here has run against Supabase Auth, and the hosted settings (A1) are not done. The database half is US-01b |
| US-01b | 🚧 | An attacker calls the auth API directly with a non-Vanderbilt address | The request bypasses our sign-in form | The database trigger rejects it | `tests/db/profiles.test.ts`, "signup is Vanderbilt-only" — a direct insert into `auth.users` stands in for the auth API; also covers look-alike domains and changing the address later (A2). **Written, not yet run on Supabase's database** (no Docker when written; run only against PGlite with an imitation `auth` schema). Not tested: the trigger through the real Supabase Auth API |
| US-21 | 🚧 | A student is signed in on a shared computer | They tap Sign out | Their session ends on that device and the header offers "Sign in" again | `src/app/login/actions.test.ts` — `signOut` ends this device's session (`scope: "local"`) and redirects home; `SiteHeader.test.tsx` — the sign-out form. **Not yet:** run against Supabase |
| US-02 | ⬜ | A signed-in student is on Create Session | They submit course, topic, a place (from Google Places — there is no building list, ADR 0008), room, time range, capacity | The session is saved, the host is added to the roster, and a pin appears on the map | Unit test + integration test. **So far:** the form exists (W5) and submits to the `createSession` stub, which validates and redirects but **saves nothing** — S3 |
| US-02b | 🚧 | A signed-in student is on Create Session | They submit an end time before the start, or a time in the past | Submission is blocked with a field-level error | Unit test: `src/lib/validation.test.ts`, the "US-02b" block — the rule and its field-level messages. Component test: `src/components/CreateSessionForm.test.tsx` — the form shows a `startsAt`/`endsAt` error beside its input (`role="alert"`, `aria-describedby`) and keeps what was typed (W5). **Not yet:** the database refusing them (S1) |
| US-03 | ⬜ | Three upcoming sessions and one ended session exist | A signed-in student opens the map | Three pins appear, the ended one does not; tapping a pin shows course, time, and seats left | Manual on staging — Sprint 3. **So far (list half, not the map):** `SessionBrowser.test.tsx` renders course, time and seats left per card; the ended/cancelled filter is only the fixture stub's (`fixtures.test.ts`) until S4 |
| US-04 | ⬜ | A signed-in student views an open session with space | They tap Join | Attendee count increases by one, their name appears on the roster, and the chat unlocks | E2E — Sprint 3 |
| US-05 | ⬜ | A student has joined a session with at least one other attendee | They type a message and send | It appears for every attendee within a second, tagged with sender and timestamp | Two-client manual test, then E2E |
| US-05b | ⬜ | A student has **not** joined a session | They query the messages table for it | No rows are returned | Database authorization rule — needs a DB test |
| US-07 | ⬜ | A session has reached capacity | A new student attempts to join | The join is rejected, the button reads "Session full", and the count does not change | Unit test on message mapping |
| **US-07b** | ⬜ | A session has exactly one seat left | **Two students attempt to join at the same moment** | Exactly one succeeds; the other is told the session is full; the roster never exceeds capacity | **DB concurrency test — see below** |
| US-08 | ⬜ | A student has joined a session | They tap Leave | They disappear from the roster and the seat is released | E2E — Sprint 3 |
| US-09 | ⬜ | A host owns an open session | They cancel it | Attendees see a cancellation notice and new joins are rejected | E2E — Sprint 4 |
| US-06 / US-12 | ⬜ | Several sessions exist across courses and campus zones *(zone data no longer exists — US-12 needs rethinking, ADR 0008)* | A student applies a course or zone filter | Only matching sessions remain; clearing the filter restores all | Component test — Sprint 3 |
| US-16 | 🚧 | No sessions exist for a student's course | They open the session list | The empty state invites them to start one or post a request | Component test: `src/components/SessionBrowser.test.tsx` — an empty list shows an invitation linking to `/sessions/new`. **Not yet:** "for a student's course" needs the course filter (US-06); "post a request" needs study requests (later sprint) |
| US-23 | ⬜ | A student is deciding whether to walk across campus | They open a session | They see who is already attending before joining | E2E |
| US-11b | ⬜ | A signed-in student queries another student's profile row | They request the `email` column | The request is denied; name, major, and year are returned | Column-level access control — needs a DB test |

## US-07b is the one to write first

The report called concurrent seat claims the project's most serious risk. We
disagree about the *schedule* impact (see
[ADR 0005](./adr/0005-ci-in-sprint-one.md)) — but the correctness claim still
needs proving, and it is the only acceptance criterion here that cannot be
verified by clicking around.

The test needs two database connections, not two browser tabs:

```sql
-- Connection A                     -- Connection B
begin;                              begin;
<join the session>;                 <join the session>;   -- must block
commit;                             -- unblocks, must fail as "full"
```

The exact call depends on the schema decision (TASK-00). What matters is that
B blocks until A commits, and then fails — rather than reading a stale count
and succeeding.

Write it as soon as there is a schema. The local database and the harness
already exist: `tests/db/harness.test.ts` runs exactly this shape with an
advisory lock standing in for the join, and was checked to fail when the two
connections do not contend. Note what the test does *not* need: a browser, a
running app, or two people clicking. Two connections and a transaction are
enough.

**Why Vitest with two `pg` clients rather than pgTAP.** pgTAP runs each test
file inside a single database session, so one connection cannot block on
another without `dblink` workarounds. US-07b is precisely a two-session test.
Vitest also keeps database tests in the same language and runner as the unit
tests. pgTAP remains a good fit for single-session checks such as RLS policies,
and can be added alongside if the team prefers it there.

**Database tests run in CI** (the `db` job in `ci.yml`), not only locally.

## Coverage, stated plainly

**Pieces of two rows, none complete.** `npm test` covers `src/lib/env.ts` — missing and
malformed configuration — since W4, the form validation rules in
`src/lib/validation.ts`, and since W5 the screens as components (below). `npm run test:db` proves the database harness can connect and
make one connection wait on another, and runs one permanent structural guard:
`tests/db/rls.test.ts` fails if any table in `public` has Row Level Security
switched off (checked to fail when a table without RLS was added). Nothing in
this table is verified.

The RLS guard is not authorization coverage. It proves RLS is *on*, not that
any policy is *right* — and today there are no policies at all, so every
table is simply closed. US-05b, US-11b, and every other access rule still
need their own tests once their policies exist.

The schema skeleton (W2) exists, but no acceptance criterion depends on
structure alone, so W2 verifies none of them.

The starter data (W3) verifies none of them either. `tests/db/seed.test.ts`
checks that the seeded departments and courses match `data/` exactly and are
in normalised form (checked to fail when a JSON title was changed, and when
non-normalised rows were inserted). CI also fails if `supabase/seed.sql` or
`src/lib/database.types.ts` has drifted from its source (both commands
checked locally to fail on a deliberate change). That is data hygiene, not behaviour: nothing yet
normalises what a *student* types — that is S2, and it needs its own tests.

W4's `src/lib/validation.test.ts` is the half of US-02b that exists: the
schema rejects an end at or before the start and a start more than five
minutes in the past, each with a message on the right field, and reports
both at once. Each of those tests was checked to fail when its rule was
broken. The other half — the form rendering those errors (W5) and
`create_session` rejecting the same input (S1) — does not exist yet. The
same file tests the sign-in domain rule and, since A3, the emailed-code rule.
US-01 is 🚧, not ✅: A3's tests (actions, confirm route, form) run against a
mocked Supabase, so no email has been sent or link followed, and the
database trigger (US-01b) has not run on Supabase's database. `src/lib/fixtures.test.ts` and
`src/components/LocationPicker.test.tsx` check that the stubs' fixtures are
consistent and that the picker keeps its props contract — scaffolding, not
behaviour a student sees.

W5's component tests (`SessionBrowser.test.tsx`, `CreateSessionForm.test.tsx`,
`SiteHeader.test.tsx`) render the screens in jsdom with fixture data and a
mocked `createSession`: a card's seats text and "Full" state, the empty
state's link, each field error rendered and linked, values kept across two
failed submits, the typeahead (debounce, cancelling the previous request,
"create it?"). `src/lib/format.test.ts` checks times print in campus time
whatever the machine's zone, and `src/lib/datetime-local.test.ts` that the
form reads the times a student types as campus time too, across both
daylight-saving changes. They prove the screens render what they are
given. They do not prove anything is saved, read from the database, or
protected — every call below the UI is still a stub. The form was also
clicked through once on the dev server at 375px (errors shown and kept, a
valid submit landing on `/sessions`); that is a manual check, not a test.

The green CI badge certifies that the code compiles, lints, reaches a
database, has RLS switched on everywhere, that the generated files are
current, that the form rules behave, and that the screens render fixture
data as intended — nothing more. Say that plainly in the report rather than letting
"CI passing" do unearned work.
