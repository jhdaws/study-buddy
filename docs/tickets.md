# Sprint tickets

Each ticket is one person, one sitting. Name branches after the ticket and
story (`w2-schema-skeleton`, `s3-us-02-create-session`).

**Sizes:** S ≈ 1–2h · M ≈ 3–4h · L ≈ 5–6h — guesses; re-size after this sprint.
**Status:** ⬜ not started · 🚧 in progress · ✅ done

## Sprint 3 focus (from 2026-10-12, ends Oct 20)

Everything aims at the Sprint 3 finish line; demo-only work waits for
Sprint 4. The project board's **Priority** field orders it:

| Priority | Tickets | Owner |
| --- | --- | --- |
| **P0 · CI/CD** | W1 (remaining items), W7, W8, W9, W10 | Jack |
| **P1 · Sprint 3 core** | S4, S5, S6 · M1, M2, M3 · M5 | Nate (S4, S6), Tapan (S5, M5), Moses (M1–M3) |
| **P2 · Sprint 3 stretch** | M4 (map), W0 | Moses, Jack |
| **P3 · Sprint 4** | W6, A1, A5, M6 | Jack (W6), Moses |

Until A1 and A5 give production a working email sender, sign in with
`npm run auth:link` (`supabase/README.md`, step 6).

## Sprint 2 goal

**A Vanderbilt student can sign in, create a study session, and see sessions
in a list — on the deployed app.** (US-01, US-21, US-25, US-02, and the list
half of US-03.)

**Done when:** two people with `@vanderbilt.edu` addresses sign in on the
production URL; one creates a session; the other sees it in the list with the
right seat count.

## Four tracks

**Track W goes first and wires everything.** It builds every table, every
page, and every function the other tracks need — with *stubs* that return
fixture data, so the whole app clicks through end to end before anything real
exists. Each other track then replaces its own stubs with the real thing. After
W4 lands, nobody is waiting on anybody.

| Track | Owner | Builds | Replaces these stubs |
| --- | --- | --- | --- |
| **W · Wiring** | Jack | Schema skeleton, starter data, the stubs themselves, basic UI | — |
| **A · Auth** | Moses | Sign-in, display name, route protection | `src/app/login/*`, `src/app/auth/confirm/route.ts`, `src/lib/supabase/proxy.ts` |
| **S · Sessions API** | Tapan (S1–S3, S5), Nate (S4, S6) | Creating sessions, the session list, course typeahead | `src/app/sessions/actions.ts`, `src/lib/sessions.ts` |
| **M · Google Maps** | Moses (M5: Tapan) | Keys, location picker, location validation | `src/components/LocationPicker.tsx`, `src/lib/places.ts` |

```mermaid
flowchart LR
    W0["W0 · Decisions review<br/>all four · 30 min"]
    W["W1–W4 · Track W<br/>setup, schema, seed, stubs"]
    NOW["Start day one<br/>A1, A3 · S2 rules · M1, M2"]
    A["Track A<br/>A2, A4"]
    S["Track S<br/>S1–S4"]
    M["Track M<br/>M3, M4"]
    W5["W5 · Basic UI"]
    W6["W6 · Integration<br/>and demo"]

    W0 --> W
    W --> A & S & M & W5
    NOW --> A & S & M
    A & S & M & W5 --> W6
```

| Track | Day one — no dependencies | Once W2 (schema) and W4 (stubs) land |
| --- | --- | --- |
| W | W0, W1, then W2 → W3 → W4 in order | W5, W6 |
| A | A1, A3 | A2, A4 |
| S | S2's normalization rules and tests | S1, S3, S4 |
| M | M1, then M2 | M3, M4 (stretch) |

### How the stubs work

- **A stub is a typed function or component whose signature W4 fixes.** Its
  body returns fixture data. Its comment names the owning track and ticket.
  Every seam — file, signature, owner, what the stub returns, what the real
  body must do — is listed in [`contracts.md`](./contracts.md).
- **Replace the body, keep the signature.** If a signature has to change, do
  it in a PR that updates every caller, and tell Jack.
- **W2 turns on RLS for every table with no policies**, so nothing is readable
  until a track adds the policies for its tables. That is the safe direction:
  a missing policy fails closed.
- **Migrations:** `npx supabase migration new <name>`, one per PR. Never edit
  one that has merged.

---

## Track W · Wiring, data, basic UI — Jack · do first

#### W0 · Decisions review
**All four · 30 min · first thing**
- [x] Confirm or change the [technical picks](#confirmed-at-w0) and the three unconfirmed readings — all confirmed
- [x] [ADR 0008](./adr/0008-sprint-2-schema-decisions.md) written and Accepted — supersedes ADR 0007's campus-building layer and ADR 0006's closed department list
- [x] `architecture.md` §2, `data/README.md`, and `supabase/README.md` updated to match
- [ ] Worth the same meeting: ratify or overrule ADRs 0001–0003

#### W1 · Finish setup
**S · TASK-03 · 🚧**
- [x] Hosted Supabase project created; Vercel connected, `main` deploys, previews on PRs
- [x] `permissions: contents: read` in `ci.yml`
- [x] Migrations and seed pushed to the hosted project (`supabase db push --include-seed`) — all six tables confirmed through the API; the seed rows are hidden by RLS until policies exist, so their presence is not confirmed
- [x] Same two Supabase values in Vercel for Production, Preview, and Development — done (reported); not checkable from outside while production is behind Vercel's login
- [ ] Supabase URL and publishable key shared with the team through a password manager
- [x] Production URL in the README: https://study-buddy-jdaws.vercel.app
- [x] **Production loads for a signed-out visitor.** Confirmed 2026-10-11: `/` and `/login` return 200, `/sessions` redirects to `/login`. Before that it did not: every page redirects to Vercel's login (Deployment Protection), so teammates without Vercel access — and every magic link in A1/A3 — hit a login wall. Turn protection off for production (Vercel → Settings → Deployment Protection); decide separately whether previews stay protected
- [x] **Before M1 creates any keys:** secret scanning and push protection on
- [x] `main` ruleset: PR with one approval required, `verify` check required, no force push, no deletion
- [ ] Add the `db` check to the ruleset's required checks
- [x] Require branches to be up to date before merging (ruleset → required status checks). #31–#33 were each green alone; merged together, 21 `db` tests failed (2026-10-06 review)
- [ ] "Automatically delete head branches" on (Settings → General)
- [ ] Dependabot config for npm and GitHub Actions

#### W2 · Schema skeleton
**M · TASK-00 · after W0**
- [x] One migration with every Sprint 2 table: `profiles`, `departments`, `courses`, `locations`, `sessions`, `session_attendees` — columns, keys, and foreign keys per ADR 0008
- [x] Structure only. Rules, triggers, and policies belong to the owning track
- [x] RLS enabled on every table, no policies
- [x] Database test that **every table in `public` has RLS enabled** — a permanent guard, not a placeholder (`tests/db/rls.test.ts`)

#### W3 · Starter data, seed, types
**S · TASK-02 (reduced), TASK-05 · after W2**
- [x] ~10 departments the team takes and a few course numbers each, in `data/`
- [x] Course-number format checked (four digits? letter suffix?) and noted for S2 — four digits plus an optional `W` or `L`; findings in [`data/README.md`](../data/README.md#for-s2-what-the-catalogue-says-about-the-format)
- [x] `supabase/seed.sql` built from `data/` (`npm run db:seed`); `npm run db:reset` loads it
- [x] `npm run db:types` generating `src/lib/database.types.ts`
- [x] CI check that the seed matches `data/` (`verify` job), plus one that the types match the migrations (`db` job)

#### W4 · Stubs and fixtures
**M · after W3 · unblocks A, S, M**
- [x] `src/lib/fixtures.ts` — sessions (one full, one with only the host), departments, courses, locations
- [x] `src/lib/validation.ts` — `signInSchema`, `displayNameSchema`, `createSessionSchema` (end after start, not in the past, capacity ≥ 2), unit tested, including US-02b
- [x] Stubs with final signatures, each returning fixtures:
  - Track S: `createSession()` in `sessions/actions.ts`; `listSessions()`, `listDepartments()`, `searchCourses()` in `src/lib/sessions.ts` — the typeahead reaches `searchCourses()` through `GET /api/courses` ([why](./contracts.md#why-searchcourses-goes-through-a-route-handler))
  - Track M: `<LocationPicker>` (stub: a select of fixture places that submits a `place_id`); `resolvePlace(placeId)` in `src/lib/places.ts`
  - Track A: `signIn()`, `saveDisplayName()`, `signOut()` in `login/actions.ts`; `requireUser()` in `src/lib/supabase/server.ts`
- [x] Every stub's comment names its owning ticket — all listed in [`contracts.md`](./contracts.md)

#### W5 · Basic UI
**L · US-02, US-03 · after W4**
- [x] App shell: header, navigation, sign-in / sign-out link — the header shows "Sign in" until A3 makes a session possible; the sign-out form is component-tested only
- [x] `/sessions`: list and card — course, topic, location, room, time, seats left; "Full" treatment; empty state inviting hosting. Times shown in campus time (`CAMPUS_TIME_ZONE`) — and entered in it too: the form reads its time inputs as Nashville time whatever the device's zone
- [x] `/sessions/new`: department picker with "add a department", course-number typeahead, topic, room, start, end, capacity, `<LocationPicker>`; field errors from `createSessionSchema`
- [x] Mobile first: 44px tap targets, `text-base` inputs (ADR 0004) — checked at 375px in a browser
- [x] Works end to end on fixtures: submitting the form validates and lands on the list (the stub saves nothing, so the new session does not appear until S3)

#### W6 · Integration and demo
**M · Sprint 4 (deprioritised 2026-10-12) · Jack**
- [ ] Merge tracks as they land; fix any seam mismatches
- [ ] Run the Sprint 2 "done when" on production with two real accounts
- [ ] `docs/test-cases.md` updated with what is genuinely verified
- [ ] Fixtures no longer used by the app kept only where tests need them

#### W7 · Deploy migrations from CI
**S · TASK-03 · P0 CI/CD · Jack**

The hosted database changes only when someone runs `supabase db push` by hand, while Vercel deploys `main` on every merge. Once #31–#33 merge, production would run code calling `create_session` before the hosted database has it.
- [ ] A job on push to `main`: `supabase link`, then `supabase db push` to the hosted project, with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in a GitHub `production` environment
- [ ] Runs only after `verify` and `db` pass for that commit
- [ ] No `--include-seed`: reseeding the hosted project stays a deliberate, manual step
- [ ] Every migration must work with the app version already deployed: Vercel deploys at the same time, and nothing orders the two. Additive changes are fine (functions, policies, CHECKs that existing rows pass); renames and drops take two steps
- [ ] First run: compare the hosted project's `supabase migration list` with `supabase/migrations/`
- [ ] Documented in `supabase/README.md`

#### W8 · End-to-end smoke test in CI
**M · Sprint 3 · P0 CI/CD · Jack** — start with journey 1 (sign-in); add journeys 2 and 3 as S4, M5 and S5 land

One browser test of the Sprint 2 "done when", so the main path is checked on every PR rather than by hand at demo time. Not before S4 and M5: until then it could only click through fixtures.
- [ ] Playwright: two `@vanderbilt.edu` users sign in with the code read from Mailpit's API; one names themselves and creates a session; the other sees it in the list with the right seat count — journeys 1 (sign in, name step) and 2 (host a session, checked in the database) pass; journey 3 waits for S4 (`tests/e2e/journeys.spec.ts`)
- [x] Runs in CI against the full local stack (`supabase start`) with the app built and started (`next build && next start`), at 375px (ADR 0004) — the `e2e` job
- [x] A Playwright trace uploaded as a workflow artifact on failure
- [ ] Added to the ruleset's required checks once it has run a week without flaking

#### W9 · Unit tests for the riskiest server code
**M · Sprint 3 · P0 CI/CD · TEST_PLAN.md "Next tests" · Jack**

Sprint 3 needs 60%+ coverage and integration tests. The baseline is 77.2% branch, 68.1% line, and the two riskiest server functions have no unit tests: `resolvePlace()` (0 of 35 branches) and `createSession()` (0%). Vitest can import both since #41.
- [x] `resolvePlace()` with `fetch` and the admin client mocked: a place 5 km away refused as `outside_campus` with nothing written; an excluded type refused; Google's errors and a timeout mapped; fixture ids accepted only without a server key
- [x] `createSession()` with Supabase mocked: a `PlaceError` becomes a field error on `placeId`; an RPC error goes through `databaseErrorMessage()` and is logged; success redirects to `/sessions`
- [x] Re-measured with `npm run test:coverage`; the baseline in `TEST_PLAN.md` updated (targets: ≥ 80% branch overall, ≥ 90% on `src/lib/`)
- [x] `coverage.thresholds` in `vitest.config.mts` set to the new numbers, so coverage cannot quietly drop

#### W10 · Preview deployments get their own database
**M · Sprint 3 · P0 CI/CD · Jack**

Every Vercel preview uses the production Supabase project (W1 set the same values for Production, Preview and Development), so a PR's preview runs new code against production's old schema and writes test data into production.
- [ ] Decide: Supabase preview branches (a database per PR; disabled in the integration settings now, may need a paid plan) or a second, free Supabase project as shared staging
- [ ] If staging: migrations and seed pushed to it; its keys in Vercel's **Preview** environment only; W7's workflow pushes migrations there too
- [ ] Sign-in on a preview works with `npm run auth:link` and `SIGN_IN_SITE_URL` set to the preview URL
- [ ] Production's variables are on Production only; documented in `supabase/README.md`

---

## Track A · Auth

#### A1 · Hosted auth settings
**S · US-01 · Sprint 4 · Moses** — the templates are locked until A5's custom SMTP exists
- [ ] Supabase Auth Site URL = production URL; redirect URLs cover localhost and Vercel previews
- [ ] Magic-link email template points at `/auth/confirm` with `token_hash` — written (`supabase/templates/magic_link.html`, a 6-digit code plus the link); **not yet pasted into the hosted dashboard** — steps in [`supabase/README.md`](../supabase/README.md#hosted-auth-settings-a1)
- [x] Same settings in `supabase/config.toml` for local (local emails appear in Mailpit at http://127.0.0.1:54324) — never run locally (Docker down)
- [x] Free-plan email rate limit checked — **2 emails an hour for the whole project, delivered only to Supabase organization members** (Supabase docs, 2026-09-30). The "done when" needs both people in the organization, or custom SMTP

#### A2 · Profile rules
**M · US-01, US-25 · after W2 · ✅ merged in #33 (via #42); `npm run test:db` passes on a real local Supabase and in CI**

`supabase/migrations/20260930210000_profile_rules.sql` and
`tests/db/profiles.test.ts`. First run on a real Supabase in CI's `db` job on
#33, then locally on 2026-10-11 with every other database test (93 passing);
applied to the hosted project.
- [x] Trigger rejecting non-`@vanderbilt.edu` signups — also on an email change
- [x] Trigger creating a `profiles` row on signup
- [x] `display_name` CHECK matching `displayNameSchema`: 1–50 characters after trimming (`DISPLAY_NAME_MAX_LENGTH` in `src/lib/limits.ts`)
- [x] RLS: signed-in users read display names; users update only their own
- [x] **Don't copy email into `profiles`.** It already lives in `auth.users`,
      which clients cannot read — that satisfies US-25 without column grants.
      (A column grant *is* used, but for a different reason: so a user can
      update only `display_name`, not `id` or `created_at`.)
- [x] Database tests: US-01b (direct non-Vanderbilt signup rejected); a user cannot update someone else's profile

#### A3 · Magic-link sign-in
**M · US-01, US-21 · start now · ✅ merged in #33; run end to end against a local Supabase Auth on 2026-10-11 — not yet on production (A1, A5)**

Scope added by the user: the email carries a **one-time code as well as the
link**, and `/login` takes the code (`verifyCode()`). Reason: Vanderbilt mail
goes through Outlook, whose Safe Links scanning can open links before the
student does; the code also works across devices. **Caveat found while
building it:** link and code are one token, so a scanner that opens the link
spends the code as well — see `supabase/README.md`, "Hosted auth settings".
ADR 0003 still says "magic link" — not edited.
- [x] `signIn()` validates with `signInSchema` and sends the link — local email (Mailpit) received with code and link, 2026-10-11; no real email yet (A5)
- [x] `/login` page with "check your inbox" state and `role="alert"` errors — component-tested (`SignInForm.test.tsx`), plus the code step
- [x] `/auth/confirm` exchanges the token and redirects **only to same-origin paths** — the redirect rule is unit-tested (`safe-next.test.ts`, `route.test.ts`); the link signed in against a local Supabase, opened in the browser that asked for it (another device not tried)
- [x] Code sign-in: `verifyCode()` — unit-tested, and signed in with a real code against a local Supabase
- [x] `signOut()` (US-21) — unit-tested, and run in the browser against a local Supabase

#### A4 · Display name and route protection
**M · US-01 · after W2, A3 · ✅ merged in #33; run end to end against a local Supabase on 2026-10-11**
- [x] First sign-in without a display name goes to a name step (`/login/name`) before anything else; `saveDisplayName()` — unit-tested, and run in the browser against A2's policies (the stale header after it was BUG-11, fixed in #44). A nameless student who skips the step can still *browse* `/sessions` (the proxy only checks sign-in); every page or action that calls `requireUser()` — `/sessions/new`, `createSession` — sends them back to it, which is what ADR 0008 rule 1 requires
- [x] Proxy redirects signed-out users away from `/sessions*`, keeping `?next=` — unit-tested (`proxy.test.ts`), including that the redirect keeps refreshed cookies; Supabase mocked
- [x] `requireUser()` implemented — S3 calls it — unit-tested (`server.test.ts`), and redirected a nameless user from `/sessions/new` against a local Supabase

#### A5 · Demo email delivery
**S · US-01 · Sprint 4 · after A1, #33 · Moses**

Per #33, Supabase's built-in sender reaches only members of the Supabase organization, about 2 emails an hour — not enough for the demo.
- [ ] Every tester can receive a sign-in email: custom SMTP (Authentication → SMTP), or every tester in the Supabase organization
- [ ] Rate limit enough for the demo: four testers, a few retries each
- [ ] A real sign-in email to an `@vanderbilt.edu` address: does Outlook's link scanning spend the token before the student does (the code then fails too)? If so, the fix in `supabase/README.md`, "Mail scanners" (#33)

---

## Track S · Sessions API

#### S1 · Session rules
**L · US-02 · after W2**
- [x] CHECKs: end after start, capacity ≥ 2. No maximums — the host decides
- [x] `create_session` database function: inserts the session **and** the host
      as an attendee in one transaction; rejects a start in the past —
      allowing the same `START_GRACE_MINUTES` (5) the form allows, or the
      database rejects what the form accepted; requires a display name
- [x] No client INSERT on `session_attendees` (joining is later, through its own function)
- [x] RLS: signed-in users read sessions and attendees
- [x] Database tests for each rejection, and for the host landing on the
      roster (`tests/db/session-rules.test.ts`) — first written against a
      plain-Postgres stand-in; since 2026-10-11 passing on a real local
      Supabase and in CI (#46), with the length CHECKs of
      `*_session_text_limits.sql` (`tests/db/session-text-limits.test.ts`)

#### S2 · Departments and courses
**M · US-02 · rules start now, database after W2**
- [x] Normalization in `src/lib/validation.ts` and matching SQL — `cs`, ` CS `, `C.S.` → `CS`; unit tested; the database twin passes on a real Supabase (see S1)
- [x] Create-on-use: a function returning a course id, creating the department or course if new
- [x] RLS: signed-in users read and create; no client updates or deletes

#### S3 · Create a session for real
**M · US-02 · after S1, S2**
- [x] Replace the `createSession()` stub: `requireUser()` → validate → `resolvePlace()` → create-on-use course → `create_session`
- [x] Database errors mapped through `src/lib/errors.ts`, never raw Postgres text
- [x] Redirects to the list — **but the new session cannot yet appear there**:
      `listSessions()` is still S4's stub, reading fixtures, not the database

#### S4 · Lists and typeahead for real
**M · US-03 · after S1 · Nate; Tapan reviews · DONE**
- [x] `listSessions()`: ended and cancelled sessions excluded, seats left derived from the roster (never stored), soonest first — one query; `ends_at=gt.now` so "ended" is decided by the **database's** clock, and `session_attendees (count)` so Postgres counts the roster rather than this process fetching it
- [x] `listDepartments()`; `searchCourses()` ordered by how many sessions used each course — the ranking happens in TypeScript because the count is an embedded aggregate and PostgREST cannot `ORDER BY` one; the needle is reduced to letters, digits and spaces first, since it reaches `or=(…)` as filter *syntax*
- [x] `hostDisplayName` on each item needs A2's profiles read policy — A2 has since landed, so this is the real name, through `profiles!sessions_host_id_fkey`. The foreign key has to be named: a plain `profiles` embed is ambiguous and fails with `PGRST201`
- [x] W8's journey 3, parked on this ticket (`test.fixme("Needs S4")`), now runs: a second student signs in and sees another's session with the right seats left

#### S5 · Join and leave with a seat limit
**L · US-04, US-07, US-08 · Sprint 3 · Tapan**

The other half of the core loop: a student can host and browse, but not yet join. Design in `architecture.md` §3: join and leave go through database functions holding a row lock, never a plain `INSERT` from app code.
- [ ] `join_session(session_id)`: SECURITY DEFINER, locks the session row (`for update`); refuses when full, cancelled, ended, already joined, signed out, or without a display name, each with a short raised message; inserts into `session_attendees`
- [ ] `leave_session(session_id)`: removes the caller; the host cannot leave (they cancel, US-09, later)
- [ ] No client INSERT or DELETE on `session_attendees`; `anon` gets no EXECUTE on either function
- [ ] `joinSession()` and `leaveSession()` server actions, errors mapped in `databaseErrorMessage()`
- [ ] Database tests for every refusal, and **US-07b**: two concurrent joins for the last seat, exactly one succeeds. Then delete `tests/db/harness.test.ts` (CLAUDE.md)
- [ ] Seats left in the list reflect joins and leaves

#### S6 · Session page with roster
**M · US-04, US-23 · Sprint 3 · after S4 · Nate**

`src/app/sessions/[id]/page.tsx` and `src/components/SessionRoster.tsx` are comment-only stubs; their TODOs are the spec.
- [ ] `/sessions/[id]`: the session in campus time, seats left; a 404 when it does not exist or is not visible
- [ ] `<SessionRoster>`: attendees by display name (US-23, never email — US-25), live seat count, host marked
- [ ] Join and Leave wired to S5's actions; disabled at capacity with the reason; "You're hosting" for the host
- [ ] A notice when the host has cancelled
- [ ] The home page's and cards' "View" links point here

---

## Track M · Google Maps

#### M1 · Google Cloud and keys
**M · TASK-06 · after W1's push protection · Moses · needed by about Oct 14**

M2 and the map (M4) wait on these keys, and Sprint 3 ends Oct 20. If billing cannot be set up by then, M4 moves to Sprint 4 so Moses is not blocked.

- [ ] Billing account attached; owner agreed by the team
- [ ] Maps JavaScript API and **Places API (New)** enabled — the legacy Places API lacks `locationRestriction` and `includedPrimaryTypes`
- [ ] Browser key restricted by **HTTP referrer** (production, previews, localhost) and by API
- [ ] Server key restricted **by API only**. IP restriction, as ADR 0007
      suggests, does not work on Vercel — its functions have no fixed outbound
      IP. Keep the key server-side and set a daily quota cap on Places instead
- [ ] Budget alert set; both keys in `.env.local` and Vercel
- [ ] Pricing, and **whether a place's name may be cached**, checked on Google's own pages

#### M2 · Location picker
**L · US-02 · after M1 · Moses**
- [ ] Replace the `<LocationPicker>` stub, keeping its props
- [ ] Places Autocomplete with `locationRestriction` from `CAMPUS_CENTER` and `CAMPUS_RADIUS_METERS`
- [ ] `includedPrimaryTypes` that surface campus buildings as well as cafés and
      libraries, but not residences — **check Featheringill and Stevenson appear**
- [ ] Session tokens used; submits a `place_id`, never coordinates

#### M3 · Validate and store locations
**M · US-02 · after W2, M1 · Moses**
- [ ] Replace the `resolvePlace()` stub: look the place up with the server key, check the distance and place type, store it, return a location id
      — **code written, not yet verified:** no Google call has been made (no
      key exists until M1) and it has never written to a database. Fixture
      IDs keep working until M2 (see the comment in `places.ts`)
- [x] Distance check as a pure function, unit tested (`src/lib/geo.ts`; the
      type and response rules in `src/lib/place-policy.ts`, also unit tested)
- [ ] Location rows written only by the server, the way W0 decided; RLS lets clients read, never write
      — **migration and `tests/db/locations.test.ts` written, never run:**
      Docker was down, so neither has touched a database

#### M4 · Map view (stretch)
**M · US-03 · only once M1–M3 are done · Moses**
- [ ] List / map toggle on `/sessions`; one marker per session, distinct when full; loads client-side only

#### M5 · A location sessions can use before M2
**S · US-02 · Sprint 3 · Tapan** — W8 needs a location sessions can use in CI

Once #31 and #32 merge, the stub picker's fixture place ids resolve to `20000000-…` location ids that are not rows, so `create_session` fails its foreign key and the student sees "Something went wrong saving that" (checked 2026-10-06 with #31–#33 merged locally). Until M1 and M2 land, nothing can be created anywhere — which blocks W6's demo and W8.
- [ ] Decide: wait for M1 and M2, or put the three fixture locations into local and CI databases only — never the hosted project
- [ ] If seeding: check how `supabase db push --include-seed` picks seed files, so they cannot reach the hosted project; production keeps refusing fixture ids once the server key is set (#31 already does)
- [ ] W6 can create a session locally

#### M6 · Refresh stored coordinates
**S · Sprint 4 (moved 2026-10-12, to make room for S5 and S6) · after M1, M3 · Moses**

#31 reports Google's terms allow caching a place's coordinates for 30 days at most — not yet checked on Google's own page. `locations.validated_at` exists for this.
- [ ] Check the rule on Google's page; record it in ADR 0008
- [ ] A scheduled job (Vercel Cron or `pg_cron`) re-validating locations older than the limit. Not a delete: `sessions.location_id` restricts deletes
- [ ] Decide what happens to a place Google no longer returns

---

## Decisions this plan rests on

Product calls, made 2026-09-29:

| Question | Decision |
| --- | --- |
| Display name | Required at first sign-in |
| Capacity and times | Set by the host; only sanity checks, no maximums |
| Host leaving | The host cannot leave — they cancel the session (US-09, later) |
| Chat after a session | Read-only once a week has passed since it ended |
| Deleted accounts | Anonymised: messages kept as "Deleted user", upcoming hosted sessions cancelled |
| Study requests | The poster sets a time range; the request expires at its end |
| Locations | No curated building list — everything comes from Google Places |
| Departments and courses | A handful seeded; users add the rest, departments included |

The last two reverse parts of ADRs 0006 and 0007. Normalization and usage
ranking are now the only defence against `CS` / `C.S.` / `COMPSCI` duplicates —
an accepted risk. All of this is recorded in
[ADR 0008](./adr/0008-sprint-2-schema-decisions.md).

#### Confirmed at W0

Approved 2026-09-29 and recorded in ADR 0008:

- Seats left derived from the roster, never a stored counter
- Authorization in RLS on every table; server checks exist for error messages
- Joining (later) through a database function holding a row lock
- Location rows written only by the server — which brings the Supabase secret key into the app as a server-only variable
- One `locations` table of Places venues, no building/venue split
- The session stores a host-editable location label; `locations` stores no name — the default until M1 finds out what Google allows
- The server Maps key is restricted by API and a daily quota cap, not IP
- Email is never copied into `profiles`
- The three readings of the product calls: chat stays writable for the week; "set by the host" still allows sanity checks; users may add departments

---

## Later sprints

IDs are assigned when a ticket is scheduled.

| Work | Stories | Notes |
| --- | --- | --- |
| Atomic join | US-04, US-07 | Row-locked join function; the US-07b concurrency test replaces `tests/db/harness.test.ts` |
| Join and leave | US-04, US-07, US-08 | Through the join function only; live roster; the host cancels rather than leaves |
| Host edit and cancel | US-09 | Cancelling is how a host leaves |
| Session detail page | US-04, US-05, US-23 | Roster, join button, chat |
| Messages and chat | US-05 | Attendees only; read-only a week after the session ends, enforced in RLS; Realtime; US-05b test |
| Study requests | US-16 | Poster-set time range. **P0 in the backlog** — deferred, not deprioritised |
| Filters | US-06, US-12 | Course filter; the campus-zone filter needs rethinking without a building list |
| Account deletion | US-24 | The anonymising behaviour decided above |
| Accessibility pass | TASK-04 | Keyboard and screen reader over the core flows |
| Safety group | US-18, US-22, US-23 | Land all three before any public launch |

**Dropped:** curating campus buildings (TASK-01) and asking VU for campus GIS
data (TASK-07) — Google Places covers every location.

## Rules

- Run the pre-PR checks in `CLAUDE.md`.
- If you used AI, add a row to `docs/ai-usage-log.md` **in the same PR**.
- When a ticket genuinely verifies an acceptance criterion, update `docs/test-cases.md`.
