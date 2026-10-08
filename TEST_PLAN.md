# Test Plan — Study Buddy · Sprint 3 · Owner: Jack Dawson (@jhdaws)

Written for ICA 10. What to test, at which level and in what order, ranked by
risk. `docs/test-cases.md` records which user stories are actually proven.
This file decides where testing effort goes next.

## Baseline (2026-10-08, `main` at `4881132`)

| | |
| --- | --- |
| Unit and component tests (`npm test`) | **141**, all passing (11 files) |
| Database tests (`npm run test:db`) | **18**, all passing (4 files), against the local Supabase database |
| Branch coverage (`npm run test:coverage`) | **77.2%** (275 / 356). Lines 68.1%, statements 68.4%, functions 72.0% |
| Least-covered module | `src/lib/places.ts`, **0%** (0 / 35 branches). All of `src/app` (server actions, route handlers): 0 / 14 |
| Levels we have | Unit (Vitest + Testing Library in jsdom), database integration (real Postgres in CI's `db` job). **No end-to-end tests.** Flows have only been clicked through by hand |

How it was measured: `npm run test:coverage`, which runs Vitest with the v8
provider over every file in `src/`. Files no test imports still count, at 0%.
The first run reported **85.7%** because it silently dropped the three files
that import `server-only` (`places.ts`, `sessions.ts`, `supabase/admin.ts`).
`vitest.config.mts` now maps `server-only` to Next's empty module, so those
files are measured.

Two caveats about the number:
- v8 counts a file with no branches as 100% branch-covered. The untested
  server files `supabase/server.ts` and `supabase/proxy.ts` are examples, so
  line coverage (68.1%) is the more honest figure for the app layer.
- Branch coverage does not see validation rules. `validation.ts` reports 100%,
  yet five boundaries in it had no test before this PR (see "EP and BVA" below).

#32 and #33 are still open. Merged together with `main` on 2026-10-06 they
gave 289 unit tests, so re-measure once they merge.

## Targets (end of Sprint 3)

- **Branch coverage ≥ 80% overall** (77.2% today) **and lines ≥ 75%**
  (68.1% today). Both are above the course's 60%.
- **≥ 90% branch coverage on `src/lib/`**, excluding `src/lib/supabase/`
  (74.5% today). That is where the rules live: validation, error mapping,
  place checks, time handling.
- **Every server action has a unit test with Supabase mocked**, and **every
  migration rule has a database test.** Today `createSession`, `signIn`,
  `verifyCode` and `saveDisplayName` have none.
- Not a target: coverage on `src/app/` pages. They are covered by the E2E
  journeys below instead.

## Priorities (from the risk map)

Likelihood and impact are scored 1–3. Likelihood is higher for complex logic,
external services, and new or AI-written code. Impact is higher for money,
data loss, privacy and the core journey.

| Feature (story) | L | I | Priority | Unit | Integration | E2E | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sign in with a Vanderbilt email, display name, route protection, sign out (US-01, US-21, US-25; #33) | 3 | 3 | **9** | Y | Y | Y | @moses-banda |
| Create a session (US-02; S1–S3, #32) | 3 | 3 | **9** | Y | Y | Y | @tsidhwani |
| Validate and store a location, `resolvePlace` (US-02; M3, #31) | 3 | 3 | **9** | Y | Y | Y, inside "create a session" | @moses-banda |
| Join without overbooking (US-04, US-07; Sprint 3) | 3 | 3 | **9** | Y (seat maths) | Y (US-07b concurrency) | Y | to assign |
| Session list with seats left (US-03; S4, #21) | 2 | 3 | **6** | Y | Y | Y | to assign (S4 has no owner) |
| Row-level security on every table (ADR 0008) | 2 | 3 | **6** | N | Y | N | each table's track; @jhdaws for the guard test |
| Session chat (US-05; later) | 3 | 2 | **6** | Y | Y (attendees only, read-only after a week) | N | to assign |
| Department and course normalisation (US-02; S2, #32) | 2 | 2 | **4** | Y | Y | N | @tsidhwani |
| Times in campus time (US-02, US-03; W5, #30) | 2 | 2 | **4** | Y | N | Y, inside "create a session" | @jhdaws |
| Study requests (US-16; later) | 2 | 2 | **4** | Y | Y | N | to assign |
| Course typeahead, `GET /api/courses` | 2 | 1 | **2** | Y | Y | N | @jhdaws |
| Map view (M4, stretch) | 2 | 1 | **2** | N | N | N (checked by hand) | @moses-banda |

Why the 9s:
- **Sign-in** depends on Supabase Auth and email. It has never sent a real
  email, and Outlook's link scanner may spend the token first (#35).
- **Create a session** is where three tracks meet. Merging #31–#33 locally
  broke 21 database tests and typecheck, which no single PR showed.
- **`resolvePlace`** makes billed Google calls with a key that bypasses RLS,
  has never called Google for real, and is the least-covered file.
- **Joining** is concurrent by nature. Two students taking the last seat must
  not both get it.

## Integration seams to test

- `createSession()` → `resolvePlace()` → Places API (fetch mocked) → admin
  client → `locations` (local database).
- `createSession()` → `supabase.rpc("get_or_create_course" | "create_session")`
  → PostgREST → Postgres (RLS, CHECKs, `auth.uid()`). `tests/db/` calls the
  SQL directly. The PostgREST hop is covered only by the E2E journeys.
- `signIn()` / `verifyCode()` → Supabase Auth → Mailpit → `/auth/confirm` →
  the profile trigger.
- `src/proxy.ts` → `updateSession()` → redirect to `/login?next=` for a
  signed-out request.
- `listSessions()` / `searchCourses()` (S4) → `sessions`,
  `session_attendees`, `profiles` under RLS → `GET /api/courses`.

## Critical E2E journeys (W8, #37)

1. Sign in with an `@vanderbilt.edu` address, using the code read from
   Mailpit → choose a display name → land on `/sessions`.
2. Create a session (department, course, location, times, capacity) → see it
   in the list with the host already counted.
3. A second student signs in → sees that session with the right number of
   seats left. Once joining exists, they join and the count drops by one.

All three run at 375px against the full local stack. The journeys can't create
anything until M5 (#36) gives them a location that exists.

## Not testing (and why)

- **Google's Autocomplete widget and map tiles** (M2, M4). That is Google's
  code. We test `resolvePlace`, the server check that is the real control,
  with fetch mocked. Live Google calls cost money and need keys, so the real
  key gets one manual check per deploy.
- **Real email delivery.** That is Supabase's or the SMTP provider's job. The
  E2E journeys read codes from local Mailpit. One manual check against a real
  `@vanderbilt.edu` inbox happens in A5 (#35).
- **Next.js and Supabase internals** (routing, Server Action CSRF checks,
  token refresh). The frameworks test those. We test how we use them.
- **Pages with no logic and later-sprint stubs** (`layout.tsx`, `page.tsx`,
  `error.tsx`, `SessionChat`, `SessionMap`, `SessionRoster`,
  `/sessions/[id]`). There is nothing to assert yet. They stay in the coverage
  denominator, so the number doesn't flatter us.
- **`src/lib/database.types.ts`.** It is generated, and CI's `db` job checks it
  matches the migrations.
- **Visual layout.** It is checked by hand at 375px (ADR 0004). We have no
  screenshot-diff tooling.

## Next tests, in order

1. **`resolvePlace` refuses an off-campus place before writing anything.**
   Mock fetch to return a place 5 km from `CAMPUS_CENTER`; expect
   `PlaceError("outside_campus")` and no call to the admin client. This starts
   on the 0% file with the highest risk.
2. **`createSession` unit tests** with Supabase mocked: a `PlaceError` becomes a
   field error, an RPC error is mapped through `errors.ts`, success redirects.
   This is after #32.
3. **E2E journey 1** (sign in), once #33 is merged (W8, #37).

## EP and BVA: `createSessionSchema`

`src/lib/validation.ts:201`, the create-session form's rules (US-02, US-02b).
A session needs:
- a department and a course number;
- a topic of 1–120 characters after trimming;
- an optional room of at most 50;
- a location, and a location label of 1–100;
- a start no more than 5 minutes in the past;
- an end strictly after the start;
- a whole-number capacity from 2 to 2,147,483,647 (Postgres's `integer` maximum).

| Partition | Expected | Representative | Boundary values | Test written? |
| --- | --- | --- | --- | --- |
| Topic blank or only spaces | Refused: "Say what you'll be studying." | `"   "` | `""`, `" "` | Y (new) |
| Topic 1–120 characters after trimming | Accepted, trimmed | `"Design patterns review"` | 1 char; 120 chars; 120 chars plus surrounding spaces | Y (new) |
| Topic over 120 characters | Refused: "Keep the topic to 120 characters or fewer." | 200 chars | 121 chars | Y (new) |
| Room blank or missing | Accepted as `null` | `""` | `"  "`, missing field | Y (existing) |
| Room 1–50 characters | Accepted | `"Room 100"` | 50 chars | Y (new) |
| Room over 50 characters | Refused | 80 chars | 51 chars | Y (new) |
| Location label blank | Refused: "Give the location a name." | `"  "` | `""` | Y (new) |
| Location label 1–100 / over 100 | Accepted / refused | `"Featheringill Hall"` | 100 chars; 101 chars | Y (new) |
| Start at most 5 minutes ago, or later | Accepted | now + 1 hour | now − 5:00 exactly | Y (existing) |
| Start more than 5 minutes ago | Refused: "The start time has already passed." | now − 1 hour | now − 5:01 | Y (existing) |
| End after start | Accepted | start + 2 hours | start + 1 minute (the form's smallest step) | Y (new) |
| End equal to or before start | Refused, on `endsAt` | start − 1 hour | end = start | Y (existing) |
| Capacity below 2 | Refused: "At least 2 — you count as one." | 0 | 1 | Y (existing) |
| Capacity 2 to 2,147,483,647 | Accepted | 4 | 2; 2,147,483,647 | Y (2 existing, maximum new) |
| Capacity above 2,147,483,647 | Refused | 10¹² | 2,147,483,648 | Y (existing) |
| Capacity blank, not a number, or a fraction | Refused with its own message | `"lots"` | `""`, `"2.5"` | Y (existing) |

The new tests are in `src/lib/validation.boundaries.test.ts` (9 tests). Each
was checked against a deliberately broken rule: moving each limit by one,
dropping the trim, and requiring a gap of more than a minute. Every broken rule
failed at least one test. They are in their own file because #32 and #33 both
edit `validation.test.ts`.

The database does not enforce the length limits yet. That is flagged on #32,
point 4.

## How to run

```bash
npm test                 # unit and component tests
npm run db:start         # once; needs Docker
npm run test:db          # database tests against the local stack
npm run test:coverage    # unit tests with branch coverage over all of src/
```
