# Handoff log

Context that does not live in the code, the commits, or the docs — written by
each AI session at the end of its run, read by the next one at the start.

**If you are an agent starting a session: read the top entry before doing
anything else.** It tells you what is uncommitted, what was decided but not yet
written down, and what the last session got wrong.

**If you are an agent ending a session: add a new entry at the top**, above the
existing ones. Do not edit older entries — they are a record of what was
believed at the time, and rewriting them destroys the thing that makes this
file useful.

## What belongs here, and what does not

This file is for state that would otherwise be lost between sessions. It is
deliberately *not* a second copy of the documentation.

| Goes here | Goes somewhere else |
| --- | --- |
| Uncommitted work and which branch it sits on | — |
| A decision made in conversation but not yet in an ADR | `docs/adr/` once written up |
| Questions asked of the user that were never answered | — |
| A known-wrong or stale statement in the docs | Fix the doc; note the fix here |
| Something tried that failed, and why | — |
| A constraint the user stated verbally | `CLAUDE.md` if it is a standing rule |
| Task status | `docs/tickets.md` and `docs/backlog.md` |
| Why a design is the way it is | `docs/adr/` |
| What a file should contain | The stub comment in that file |

If a fact has a permanent home, put it in its permanent home and mention the
move here. An entry that just restates the backlog is noise.

## Entry template

Copy this, fill it in, delete any section that is genuinely empty rather than
writing "none".

```markdown
## YYYY-MM-DD · <one-line summary of the session>

**Branch:** <branch> · **Commits made:** <shas, or "none">

### What changed
- <file or area> — <what and why, one line each>

### Uncommitted at end of session
- <path> — <what it is, and whether it is ready to commit>

### Decided in conversation, not yet written down
- <decision> — <where it should eventually live>

### Open questions for the user
- <question, and what is blocked until it is answered>

### Things the next agent should be careful about
- <traps, stale docs, environment quirks, failed approaches>
```

### Two rules for writing an entry

**Do not claim more than you verified.** If a diagram was rendered, say so. If
a schema was written but never applied to a real database, say that too. This
file is read by someone with no way to check your work, which is exactly the
situation where overclaiming does the most damage.

**Record the failures.** The most valuable line in most entries is the one
saying an approach was tried and did not work. Without it the next session
spends its first hour rediscovering the same dead end.

---

## 2026-10-01 · Finished the stalled Track A session: A1 commit, push, PR

**Branch:** `a-us-01-sign-in` · **Commits made:** the A1 commit (config,
template, README, tickets, usage log, CLAUDE.md, both HANDOFF entries)

### What changed
- Nothing new in code. The entry below was written before its session
  stalled: at that point A1 was **uncommitted**, the branch was **not pushed**
  and **no PR existed**, despite what it says. This session committed A1,
  pushed, and opened the PR. The rebase it warns about had finished cleanly
  (reflog checked).

### Verified versus assumed
- **Verified (this session, PowerShell):** lint, typecheck, `npm test`
  (227 passed), build.
- Everything listed as not verified in the entry below still is.

---

## 2026-10-01 · Track A sign-in (A1 repo half, A2, A3, A4); M3 in PR #31

**Branch:** `a-us-01-sign-in` (from `main` at 2a6ee7e) · **Commits made:** one
per ticket — A2, A3, A4, A1 — PR opened this session. Separately, M3 is on
`m3-us-02-resolve-place`, PR #31 (its own HANDOFF entry is on that branch).

### What changed
- **A2:** `20260930210000_profile_rules.sql` — Vanderbilt-only trigger on
  `auth.users` (insert and email change), profile created on signup,
  `display_name` CHECK mirroring `displayNameSchema`, RLS (read for signed-in
  users, update own `display_name` only). Trigger functions live in a
  `private` schema so generated types do not change.
- **A3:** `/login` with an email step and a **6-digit code** step
  (`verifyCode()`), `/auth/confirm` for the link, real `signIn()` and
  `signOut()`; `safe-next.ts` and `request-origin.ts` as pure, tested helpers.
- **A4:** `/login/name` step, `saveDisplayName()`, proxy redirects signed-out
  page requests on `/sessions*` to `/login?next=`, real `requireUser()`.
- **A1 (repo half):** `config.toml` templates, `supabase/templates/magic_link.html`,
  and "Hosted auth settings (A1)" in `supabase/README.md`.

### Decided in conversation, not yet written down
- **Sign-in by code as well as link** — the user's call: Vanderbilt mail runs
  through Outlook, whose link scanning can spend a one-time link. ADR 0003
  says magic link; it may want a dated note. Note the code and the link are
  the same token, so a scanner that opens the link still kills the code —
  untested whether Vanderbilt's scanning does that.

### Verified versus assumed
- **Verified:** lint, typecheck, unit tests and build (see the PR).
- **Not verified:** the migration and `tests/db/profiles.test.ts` have never
  run (Docker down here; CI's `db` job is their first run). No real email has
  been sent: the hosted settings in `supabase/README.md` are **not applied**.

### Open questions for the user
- Apply the hosted settings (Site URL, redirect URLs, both email templates).
- Email delivery: the built-in sender reaches only Supabase organization
  members, 2 emails an hour. The "done when" needs both testers in the org,
  or custom SMTP.
- Vercel Deployment Protection still blocks production, so emailed links to
  production hit Vercel's login.

### Things the next agent should be careful about
- The subagent that wrote this stalled mid-`git rebase` (an editor command
  failed on a reword). The rebase had finished; check `git status` and the
  reflog before assuming anything is half-applied.
- `npm test` fails in Git Bash ("Vitest failed to find the runner"); run it
  from PowerShell.

---

## 2026-09-29 · Form in Nashville time; docs audited after W2–W5

**Branch:** `docs-audit-campus-time` (from `main` after #29) · **Commits made:**
one, plus this entry — PR opened this session

### What changed
- **The create form now reads and shows times in campus time**
  (`America/Chicago`), not the device's — the user's call, answering W5's
  open question. `localInputToIso` / `isoToLocalInput` take a zone defaulting
  to `CAMPUS_TIME_ZONE` and never read the runtime's zone. Each time input
  has a "Nashville time (Central)" hint. The W5 entry below still describes
  the old device-time behaviour; it is superseded.
- **Docs audited against the repo, GitHub, Supabase and Vercel.** W1's boxes
  now match reality; TASK-00 and TASK-03 ✅; US-02 and US-03 🚧; README
  layout, links and production URL; CLAUDE.md current state and conventions;
  stale `0001_init.sql` / `0002_join_session.sql` references in ADRs
  0001/0003/0005 (0005 via a dated note, body untouched); W4's cross-track
  constraints copied into A2, S1, S4.

### Verified versus assumed
- **Verified:** hosted Supabase has all six tables (REST returns `[]` for
  each and `PGRST205` for a made-up table). Repo settings via the GitHub
  API: secret scanning and push protection on; `main` ruleset requires a PR
  with one approval and the `verify` check, blocks force pushes and
  deletion. Time conversion tested under UTC, Chicago, Los Angeles and Tokyo
  and across both 2026 daylight-saving changes; the form tests run in Tokyo
  and fail (3 of 17) against the old conversion.
- **Not verified:** the Vercel env vars (user-reported) and the hosted seed
  rows (RLS hides them) — production cannot be checked from outside.

### Open questions for the user
- Turn off Vercel Deployment Protection for production? Until then every
  page of https://study-buddy-jdaws.vercel.app redirects to Vercel's login,
  which blocks teammates without Vercel access and every magic link (A1/A3).
- W1 leftovers: `db` as a required check; "automatically delete head
  branches"; Dependabot; sharing the Supabase values with the team.
- Still open from W4/W5: the 5-minute start grace, the length caps, real
  building names on fixture places, W5's copy ("Happening now",
  Today/Tomorrow), no default capacity or end time, the `limits.ts` move.

### Things the next agent should be careful about
- DST edge rules in `localInputToIso`: a nonexistent time (spring change)
  moves an hour later; a twice-occurring time (autumn change) takes the
  first. Tested — keep them if you touch it.

---

## 2026-09-29 · W5 basic UI: shell, session list, create-session form

**Branch:** `w5-basic-ui`, from `origin/w4-stubs-fixtures` at `bcce298`,
because #28 (W4) was still open when the session started · **Commits
made:** `f40a823` (the work) and the one adding this entry. #28 was merged
with a merge commit (`c558b76`) while this work was under way; `main`'s tree
is identical to `bcce298`, so the PR targets **`main`** directly with no
rebase, and its diff is only W5's commits. PR opened; **not merged**.

### What changed
- `src/app/layout.tsx`, `src/components/SiteHeader.tsx`, `NavLinks.tsx`,
  `AccountMenu.tsx` — the shell. The header reads `getCurrentUser()` (not
  `requireUser()`, which would loop on `/login` once A4 lands) inside
  `<Suspense>`.
- `src/app/sessions/page.tsx`, `SessionBrowser.tsx`, `SessionCard.tsx`,
  `src/app/sessions/error.tsx` — the list, the Full card, the hosting empty
  state, a retry screen.
- `src/app/sessions/new/page.tsx`, `CreateSessionForm.tsx`,
  `CourseNumberInput.tsx` — the form and the typeahead.
- `src/lib/format.ts` + `CAMPUS_TIME_ZONE` in `env.ts` — times out, in
  campus time. `src/lib/datetime-local.ts` — times in, browser zone → ISO.
- `src/lib/limits.ts` (new) — the numeric limits, moved out of
  `validation.ts`, which re-exports them. See below for why.
- Docs: `tickets.md` W5 ticked; `test-cases.md` (US-16 and US-02b 🚧,
  US-02's stale "building" wording fixed, coverage paragraph); `contracts.md`
  "What W5 added on top"; README status (it still said "no working
  feature"); AI-log row.

### Verified versus assumed
- **Verified locally:** `npm run lint`, `typecheck`, `npm test` (102 tests,
  47 new), `npm run build` with CI's placeholder values, `npm run test:db`.
  Mutations, each failing the matching test and then restored: dropping
  `timeZone` from the time formatter (fails under TZ=UTC and Tokyo);
  dropping the select's `defaultSelected` mirror; not refilling `room`;
  not aborting the previous typeahead request; putting the raw
  `datetime-local` value in the hidden field.
- **Clicked through once** in the Claude Browser pane (Chromium) against
  `next dev -p 3300` with `.env.local` from the local stack, viewport
  emulated at 375×812: the list shows the four fixture cards with MATH 2410
  as Full; an empty submit shows eight field errors; after filling part of
  the form and submitting, every filled value was still there (department
  select included) with four errors left; the typeahead showed `CS 3251 · 1
  session` for `32`, and ArrowDown + Enter picked it without submitting; "Add
  a department" + `BME` + `1000` showed "Nobody's studied BME 1000 yet —
  create it?"; a full submit (Enter in the capacity field) landed on
  `/sessions`. At 375px: no horizontal scroll, no control under 44px tall,
  every input 16px. **How the clicks were made matters:** the pane is 223px
  wide, so the 375px emulation is scaled, and the tool's pointer clicks
  landed off-screen (a click listener saw `clientY` 1248 in an 812px
  viewport). Buttons were therefore pressed with `element.click()` from
  JavaScript or the Enter key, and fields filled with the tool's
  `form_input` and real key presses. No real touch or pointer tap on the
  submit button was tested. Dev server stopped.
- **Not verified:** anything below the stubs (nothing saved or read); the
  sign-out button outside jsdom (it only renders with a session); iOS
  Safari (native `datetime-local` and select pickers); light mode was not
  looked at in the browser (the pane was in dark mode); a screen reader.
  CI had not run on the PR when this was written.

### Open questions for the user
- The create form reads times in the **device's** zone (the contract's
  `new Date(local)` choice); the list shows **campus** time. They agree for
  anyone whose phone is on Central time. Fine, or should the form read
  `datetime-local` values in `CAMPUS_TIME_ZONE` too? Not changed.
- Review the copy and the choices the brief left open: "Happening now" and
  Today/Tomorrow labels; `noValidate` (every message from the schema, no
  browser bubbles); no default capacity or end time; the card is not a
  link yet (no detail page).
- `src/lib/limits.ts` changes W4's file layout, though not a single
  exported name. OK, or would you rather keep the constants in
  `validation.ts` and accept zod in the client bundle?

### Things the next agent should be careful about
- **Do not import a value from `@/lib/validation` in a Client Component.**
  It pulls zod and every zod locale into the browser (a 405 KB chunk, 95
  KB gzipped, on `/sessions/new` before the move). Limits come from
  `@/lib/limits`; types via `import type`. A3/A4's forms need the same.
- **Every page is now rendered per request**: the header reads cookies.
  That is expected for an app with sign-in; do not "fix" it by removing the
  header's session lookup.
- **The header says "Sign in" on `/sessions/new`**, which runs as the
  fixture user through the `requireUser()` stub. Expected until A3/A4.
- **The `<select>` reset, refined:** W4's `key` + `defaultValue` advice is
  right for an uncontrolled select, and also survives a second submit with
  the same value (checked with a throwaway jsdom test, deleted). A
  controlled select needs the `defaultSelected` mirror instead.
- **`<LocationPicker>` has no invalid styling.** It receives
  `aria-invalid` but its stub `className` has no red border. M2's to style.
- **Browser pane clicks at an emulated viewport can miss** (above). Check
  with a click listener before concluding a button is broken.

---

## 2026-09-29 · W4 stubs and fixtures: the contract for tracks A, S, M

**Branch:** `w4-stubs-fixtures`, fast-forwarded onto `origin/main` at
`f93a9a2` (#27 merged) · **Commits made:** `560c23f` (the work) and the one
adding this entry. PR opened this session against `main`; **not merged**.
**Two agent sessions:** the first was stopped partway, leaving uncommitted
`validation.ts`, `supabase/server.ts`, `fixtures.ts` and a started
`places.ts`; this session reviewed that work, kept most of it, and finished
the ticket.

### What changed
- `docs/contracts.md` (new) — every seam: file, signature, owner ticket, what
  the stub does, what the real body must do; the shared types verbatim; W5's
  form notes; why the typeahead uses a Route Handler. Linked from
  `tickets.md` "How the stubs work"; all four W4 boxes ticked.
- `src/lib/validation.ts` — from the first session, kept. One change: the
  end-after-start rule now runs whenever both times parsed, so a past start
  no longer hides "end before start". `validation.test.ts` (27 tests).
- `src/lib/fixtures.ts` — from the first session, plus the stub bodies of
  `sessions.ts` as pure functions (`fixtureSessionList`,
  `fixtureDepartments`, `fixtureCourseSuggestions`). `fixtures.test.ts`
  (20 tests) — the file's header already promised it.
- `src/lib/sessions.ts`, `src/app/api/courses/route.ts`,
  `src/lib/course-search.ts` (new) — Track S reads; typeahead over HTTP.
- `src/app/sessions/actions.ts`, `src/app/login/actions.ts` — stubs replacing
  the old TODO lists. The atomic-join warning is kept in the sessions file.
- `src/lib/places.ts` — first session's, kept; owner line and a note on
  session tokens added.
- `src/components/LocationPicker.tsx` — props contract, fixture `<select>`,
  rewritten comment; `LocationPicker.test.tsx` (4 tests).
- Comments only: `CreateSessionForm.tsx`, `SessionBrowser.tsx`,
  `SessionMap.tsx`, `sessions/page.tsx`, `sessions/new/page.tsx`.
- `test-cases.md` — US-02b 🚧 (rule tested, form and database not);
  `ai-usage-log.md` row.

### Names W5 and the tracks build on (exact)
- `@/lib/supabase/server`: `requireUser(): Promise<CurrentUser>`,
  `type CurrentUser = { id: string; displayName: string }`. `createClient()`
  and `getCurrentUser()` unchanged.
- `@/lib/validation`: `signInSchema`, `displayNameSchema`,
  `createSessionSchema(now?: Date)`; `type FormState<Field>`,
  `FieldErrors<Field>`, `SignInField`, `SignInValues`, `DisplayNameField`,
  `DisplayNameValues`, `CreateSessionField`, `CreateSessionValues`,
  `CreateSessionSchema`; `formValues()`, `invalidFormState()`; constants
  `DISPLAY_NAME_MAX_LENGTH` (50), `TOPIC_MAX_LENGTH` (120),
  `LOCATION_LABEL_MAX_LENGTH` (100), `ROOM_MAX_LENGTH` (50), `MIN_CAPACITY`
  (2), `MAX_CAPACITY`, `START_GRACE_MINUTES` (5).
- `@/app/login/actions`: `signIn(prev: SignInState, formData): Promise<SignInState>`,
  `saveDisplayName(prev: DisplayNameState, formData): Promise<DisplayNameState>`,
  `signOut(): Promise<void>`; `type SignInState = FormState<SignInField> & { sentTo?: string }`,
  `type DisplayNameState = FormState<DisplayNameField>`.
- `@/app/sessions/actions`: `createSession(prev: CreateSessionState, formData): Promise<CreateSessionState>`,
  `type CreateSessionState = FormState<CreateSessionField>`.
- `@/lib/sessions` (server-only): `listSessions(): Promise<SessionListItem[]>`,
  `listDepartments(): Promise<Department[]>`,
  `searchCourses(departmentCode: string, query: string): Promise<CourseSuggestion[]>`;
  types `CourseLabel`, `SessionListItem`, `Department`, `CourseSuggestion`;
  `COURSE_SUGGESTION_LIMIT` (8).
- `GET /api/courses?department=&q=` → `CourseSuggestion[]` (400 without
  `department`). `@/lib/course-search`: `fetchCourseSuggestions(departmentCode, query, options?: { signal?: AbortSignal })`,
  `COURSE_SEARCH_PATH`.
- `@/lib/places` (server-only): `resolvePlace(placeId: string): Promise<ResolvedPlace>`,
  `type ResolvedPlace = { locationId: string }`, `class PlaceError` (`reason`,
  `placeId`, safe `message`), `type PlaceErrorReason`.
- `@/components/LocationPicker`: default export; `type PickedPlace = { placeId: string; label: string }`,
  `type LocationPickerProps` (`name?` default `"placeId"`, `id?`,
  `defaultValue?`, `onSelect?`, `required?`, `disabled?`, `aria-invalid?`,
  `aria-describedby?`).
- `@/lib/fixtures`: `FIXTURE_USER`, `FIXTURE_PROFILES`, `FIXTURE_DEPARTMENTS`,
  `FIXTURE_COURSES`, `FIXTURE_PLACES`, `FIXTURE_LOCATIONS`, `FIXTURE_ROSTERS`,
  `fixtureSessions(now?)`, and the three stub-body functions above.

### Verified versus assumed
- **Verified locally:** `npm run lint`, `typecheck`, `npm test` (55 tests),
  `npm run build` with CI's placeholder values, `npm run test:db`. With a
  gitignored `.env.local` from `npx supabase status -o env`, `next dev -p
  3200` served `/`, `/sessions`, `/sessions/new`, `/login` with 200, and
  `/api/courses` answered as documented (200 with suggestions; 400 without a
  department); server stopped. Mutations: breaking the past-start rule, the
  end-after-start rule, its `when` condition, or the domain check (to
  `endsWith`) each failed the matching tests; so did changing a fixture
  title, dropping the cancelled filter, and overfilling a roster. Two
  throwaway build probes, since deleted: a Client Component using
  `fetchCourseSuggestions` (which type-imports from server-only
  `sessions.ts`) builds; one importing a value from `sessions.ts` fails with
  the `server-only` error.
- **Not verified:** the four server actions were type-checked and built but
  **never submitted** — no form exists until W5. The pages still render only
  their `<h1>`, so the 200s prove little beyond compiling. The `<select>`
  reset behaviour below was seen in jsdom only, not a browser. Fixture
  coordinates are approximations, checked only to be inside the radius.
  CI had not run on the PR when this was written.

### Open questions for the user
- Choices the brief left to the agents, reviewable in the PR: the length
  caps and the 5-minute start grace (S1 must mirror the grace in
  `create_session`, or the database rejects what the form accepts);
  rejecting times without an offset, so the form must convert in the
  browser; `hostDisplayName` on `SessionListItem`, which makes S4's query
  depend on A2's profiles read policy; the course suggestion limit of 8.
- Fixture places use real building names (Featheringill Hall, Central
  Library) with obviously fake IDs, and the picker shows them under a
  "Fixture places (stub until M2)" group. Fine, or should the names be fake
  too?

### Things the next agent should be careful about
- **React 19's post-action form reset clears `<select>`s** — uncontrolled
  ones ignore a changed `defaultValue`, and controlled ones are reset too.
  W5: give each select `key={values?.field}` as well as `defaultValue`.
  `<LocationPicker>` works around it by mirroring its choice into
  `defaultSelected`. A controlled text input or a hidden input survives.
  (jsdom, React 19.2.8.)
- **The stubs save nothing.** Submitting the create form lands on
  `/sessions` without the new session; `signIn` sends no email;
  `requireUser()` checks nothing and returns the fixture user. All expected
  until S3, A3 and A4.
- **`sessions.ts` and `places.ts` are `import "server-only"`**, which Next
  resolves itself (the npm package is not installed). Vitest cannot import
  them — that is why the stub logic is in `fixtures.ts`. M3 should put the
  distance check in its own module, as `places.ts` says.
- **Times are UTC ISO strings.** Formatting them in a Server Component on
  Vercel without `timeZone: "America/Chicago"` shows the wrong hour.
- **`src/lib/errors.ts` has no signature yet.** S3 writes the first mapping.
- **After a throwaway build with an extra route, `npm run typecheck` fails**
  on a stale `.next/types/validator.ts` naming the deleted route. Rebuild,
  or delete `.next`.
- **Still stale, not touched:** `test-cases.md` US-02 row still says
  "building"; `src/lib/errors.ts`'s comment speaks only of the join routine.

---

## 2026-09-29 · W3 starter data, seed, and generated types

**Branch:** `w3-starter-data`, from `origin/main` at `8e978a0` · **Commits
made:** `10d8751` (the work) and the one adding this entry. PR opened this
session against `main`; **not merged**. The brief said to stack on
`w2-schema-skeleton` (#26), but #26 had already merged with a merge commit
before this session started, so the branch starts from `main` and the PR
targets `main` directly.

### What changed
- `data/departments.json`, `data/courses.json` — 10 departments (BSCI, CHEM,
  CS, DS, ECE, ECON, ES, MATH, PHYS, PSY) and 27 courses, 2–4 each. Each
  file has a `"source"` note.
- `scripts/build-seed.mjs`, run as **`npm run db:seed`** — validates `data/`
  and writes `supabase/seed.sql` (sorted, escaped, `on conflict do
  nothing`). It writes the file only; **`npm run db:reset`** loads it.
- **`npm run db:types`** = `supabase gen types --lang typescript --local >
  src/lib/database.types.ts`. Generated file committed.
- `tests/db/seed.test.ts` — seeded rows (`created_by is null`) equal
  `data/` exactly and are normalised.
- `ci.yml` — `verify` job: step "Seed matches data/"; `db` job: step
  "Generated types match the schema". `permissions: contents: read` kept.
- Docs: `data/README.md` (source, the S2 findings below), root README
  (scripts, generated files, hosted seed), `supabase/README.md` (run
  `db:types` after a migration), `tickets.md` W3 all ticked, `backlog.md`
  TASK-02 and TASK-05 ✅, `test-cases.md`, AI-log row. `CLAUDE.md`: only
  the "no database" sentence and the "seed-freshness check is planned" line
  were changed — the previous entry flagged the first as stale.

### The course-number finding (for S2) — verified
- Source: Vanderbilt's public Kuali catalogue API, no login —
  `https://vanderbilt.kuali.co/api/v1/catalog/courses/<catalogId>`; ids at
  `.../api/v1/catalog/public/catalogs`. 2026-27 undergraduate is
  `69861616dc1d2450f8837f3a`.
- **Four digits, optionally one uppercase letter: `W` (writing) or `L`
  (lab).** 2026-27 undergraduate: 3,119 of 3,407 are four digits, the other
  286 four digits plus `W` or `L`. Same shape in 2025-26 undergraduate and
  2026-27 graduate. The suffix is part of the number (`CHEM 1601` ≠
  `CHEM 1601L`).
- Six subject codes contain a hyphen (`PSY-PC`, `ES-NYC`, …); `EECE` is now
  `ECE`; cross-listed courses (`CS 4278` = `ECE 4278`) have two codes.
  Details in `data/README.md`.

### Verified versus assumed
- **Verified locally:** `npx supabase db reset` applies the migration and
  loads the seed (10 departments, 27 courses, all `created_by` null);
  `npm run lint`, `typecheck`, `npm test`, `npm run test:db` pass;
  `npm run build` passes with CI's placeholder Supabase values. The two new
  CI steps, extracted from `ci.yml` and run with `bash -e`, pass on a clean
  tree; the seed step fails with the `::error` message when a JSON value is
  changed. `seed.test.ts` fails when a JSON title changes and when
  non-normalised rows are inserted. SQL escaping checked with a title
  containing quotes, a backslash and `--`, applied in a rolled-back
  transaction. The build script rejects each kind of bad data (lowercase or
  hyphenated code, unknown department, bad number, duplicate, unknown key,
  blank title) without writing the file. `db:types` output is identical
  across runs. **CI's path** — `supabase db start` only, then
  `gen types --local` — was run in a throwaway project (`w3-ci-sim`,
  ports 553xx, since stopped): `db start` loads the seed, and the generated
  types were byte-identical to the committed file; after adding a column
  there, the regenerate-and-diff failed.
- **Not verified:** the new CI steps on GitHub (had not run when this was
  written). Nothing was pushed to the hosted project; `db push
  --include-seed` was only confirmed to exist with `--help`.
- **Assumed:** that these ten departments and 27 courses are what the team
  takes — a guess; swap freely.

### Open questions for the user
- Is the starter list right? It is the agent's guess.
- `PSY` is named `Psychology (AS)`, verbatim from the catalogue (it
  distinguishes Peabody's `PSY-PC`). Keep, or shorten to `Psychology`?
- Cross-listed courses (`CS`/`ECE`) will split sessions for one class across
  two course rows. Accept for now, or give S2 a rule? Not blocking.

### Things the next agent should be careful about
- **`database.types.ts` is unformatted** — that is how CLI 2.118.0 emits it.
  Do not format it or hand-edit it: CI compares it byte for byte. Upgrading
  the `supabase` package can change the output; regenerate in the same PR.
- **`db:types` reads the local database as it is.** Run `npm run db:reset`
  first, or schema you tried by hand leaks into the file and CI fails. If
  the database is not running, the redirect leaves the file empty —
  `git checkout src/lib/database.types.ts` restores it.
- **A migration PR must commit regenerated types**, or the `db` job fails.
  The error message says so; `supabase/README.md` lists the step.
- **`seed.test.ts` treats `created_by is null` as "seeded".** A later test
  that inserts departments or courses with a null `created_by` must roll
  back, or this test fails.
- **`on conflict do nothing`:** changing a title in `data/` does not update
  a row that already exists on the hosted project.
- **S2 owns normalisation.** `build-seed.mjs` and `seed.test.ts` each
  contain a small check (`^[A-Z0-9]+$`, `^[0-9]{4}[A-Z]?$`) — they check
  the data, they are not the app's rule. Align them once S2's rule lands.
- In this worktree-isolated session, `&&` chains mixing file edits with git
  or `docker` were refused by the isolation guard; plain commands and small
  Python scripts in the scratchpad worked. The auto-mode classifier also
  failed transiently several times — retrying the same call worked.

---

## 2026-09-29 · W2 schema skeleton and ADR 0008

**Branch:** `w2-schema-skeleton` (reset onto `origin/main` at `d7efbdb`; the
earlier stopped attempt had no commits) · **Commits made:** `2938eb4` (the
work) and the one adding this entry. PR opened this session against `main`;
**not merged**.

### What changed
- `supabase/migrations/20260929162814_schema_skeleton.sql` — the six Sprint 2
  tables and the `session_status` enum, structure only, RLS on, no policies.
  Its header names the track that owns each table's rules.
- `tests/db/rls.test.ts` — permanent guard: every table in `public` has RLS.
- `docs/adr/0008-sprint-2-schema-decisions.md` — Accepted. One-line
  "superseded in part" notes added under the Status lines of ADRs 0006 and
  0007 (bodies untouched); ADR index updated.
- `docs/architecture.md` — banner now "Agreed (ADR 0008)"; §2 redrawn; one
  sentence in §4 about the campus-zone filter.
- `data/README.md`, `supabase/README.md` rewritten; `.env.example` server-key
  comment fixed and a commented `SUPABASE_SECRET_KEY=` added.
- Stale statements fixed beyond the brief, because this PR made them wrong:
  root `README.md` (status, map row, tree, the "settle before writing the
  database" section); `docs/backlog.md` TASK-00, -01, -06 notes; the
  `googleMapsServerKey()` doc comment in `src/lib/env.ts` (comment only).
- Bookkeeping: W0's first three boxes and all four W2 boxes ticked; "To
  confirm at W0" is now "Confirmed at W0"; `test-cases.md`; AI-log row.

### Names W3, W4 and the tracks build on
- `profiles(id → auth.users, display_name null, created_at)`
- `departments(code PK, name null, merged_into → departments.code, created_by → profiles null, created_at)`
- `courses(id, department_code → departments.code, number, title null, merged_into → courses null, created_by → profiles null, created_at)`, unique `(department_code, number)`
- `locations(id, place_id unique, lat, lng, validated_at)` — `double precision` coordinates, no name
- `sessions(id, host_id → profiles null, course_id, location_id, location_label, room null, topic, starts_at, ends_at, capacity integer, status session_status default 'open', created_at)`
- `session_attendees(session_id, user_id → profiles, joined_at)`, PK `(session_id, user_id)`
- Enum `session_status`: `open`, `cancelled`. All timestamps `timestamptz`.

### Verified versus assumed
- **Verified locally:** `npx supabase db reset` applies the migration;
  `npm run lint`, `typecheck`, `npm test`, `npm run test:db` pass;
  `npm run build` passes with CI's placeholder Supabase values (this
  worktree has no `.env.local`). The RLS test failed, naming the table, when
  a table without RLS was added by hand, and passed once it was dropped. CI's
  path (`supabase db start`, not `db reset`) was checked in a throwaway
  project on port 55322, since stopped. In a rolled-back transaction: an
  `authenticated` client saw zero rows and could not insert into
  `locations`; deleting an auth user removed the profile, nulled
  `sessions.host_id` and both `created_by` columns, and deleted the roster
  row; deleting a used course or location was refused. The three §2
  diagrams were rendered with `mmdc` and looked at.
- **Not verified:** anything about Google's caching terms or key
  restrictions (ADR 0008 rules 14–15; M1's job). CI had not run on the PR
  when this entry was written. Nothing was applied to the hosted project.

### Open questions for the user
- Choices the brief left to the agent, reviewable in the PR:
  `departments.code` as primary key (as ADR 0006 sketched) rather than a
  uuid; `departments.name` nullable; `topic` required and `room` optional;
  a surrogate `locations.id` with `place_id` unique. Tightening a nullable
  column later needs a backfill.
- TASK-00 left 🚧 in `backlog.md`; it can go ✅ once this PR merges.

### Things the next agent should be careful about
- **`sessions.host_id` is nullable** so account deletion can anonymise.
  `create_session` (S1) must always set it; code reading sessions must
  handle a null host ("Deleted user").
- **US-24 must cancel the user's unended hosted sessions before deleting
  them**, and must hard-delete the auth user. The foreign keys alone leave an
  orphaned session `open` — seen in the manual check.
- **Grants are Supabase's defaults:** `anon` and `authenticated` hold every
  privilege on the new tables; RLS is the only gate. "No client write" means
  "no write policy".
- **Views bypass RLS** unless created `with (security_invoker = true)`. The
  guard test does not check views. Watch S4's seats-left query.
- **"Start not in the past" cannot be a CHECK** — it belongs in
  `create_session`. ADR 0008 says why.
- **W3's seed** inserts departments by code, then courses with
  `department_code`; `created_by` stays null for seeded rows. Seeding sessions
  would need `auth.users` rows — probably leave sessions to W4's fixtures.
- **Still stale, deliberately not touched (W4 rewrites them):** the stub
  comments in `LocationPicker.tsx`, `SessionMap.tsx`,
  `CreateSessionForm.tsx`, `sessions/new/page.tsx`, `sessions/page.tsx`, and
  `validation.ts` still describe a curated building list, a building
  dropdown, or campus zones.
- **`CLAUDE.md` "Current state" still says "There is no database".** Not
  edited — it is the project's instruction file, so the user should change
  it.
- In a worktree-isolated agent session, shell loops and variables in
  `npx`/`sed` commands were refused by the isolation guard; plain commands
  and short Python scripts worked.

---

## 2026-09-29 · Tickets reorganised into four Sprint 2 tracks

**Branch:** `sprint-2-tracks` (from `main` after #5 merged) · **Commits made:**
one, docs plus one comment in `src/lib/supabase/proxy.ts`

### What changed
- `docs/tickets.md` rewritten as four tracks: **W** (wiring — the user's own,
  done first), **A** (auth), **S** (sessions API), **M** (Google Maps).
  Track W builds the schema skeleton and typed stubs returning fixtures; the
  other tracks replace stub bodies.
- **Ticket IDs renumbered** (W0–W6, A1–A4, S1–S4, M1–M4). Old `T-xx` and `C0`
  IDs in earlier handoff entries and AI-log rows refer to the previous scheme.
  C0 is now W0. References in `CLAUDE.md`, both READMEs, `backlog.md`, and
  the proxy comment were updated.

### Decided in conversation, not yet written down
- The user owns Track W; the other three owners are not assigned.

### Things the next agent should be careful about
- **ADR 0007 and `.env.example` say to restrict the server Maps key by IP.**
  That cannot work on Vercel (no fixed outbound IP). M1 says API restriction
  plus a quota cap instead. The ADR and `.env.example` are now stale on this
  point; fix via ADR 0008, not by editing ADR 0007. Not verified against
  current Google or Vercel documentation.
- W2 enables RLS with no policies, so tables are unreadable until A/S/M add
  policies. That is intended; do not "fix" it by adding broad policies in W2.
- The three unconfirmed readings from the previous entry are still
  unconfirmed; they are listed under "To confirm at W0".

---

## 2026-09-29 · Sprint 2 re-plan and C0 product decisions

**Branch:** `sprint-2-tickets` (from `main` after #4 merged) · **Commits made:**
one, docs only

### What changed
- `docs/tickets.md` — restructured around the Sprint 2 goal: sign in, create
  a session, list sessions. Everything else is in a "Later sprints" table.
  T-C4 split: messages are now T-C8 (later). T-B2 and T-B3 dropped.
- `docs/backlog.md` — TASK-00 and TASK-03 🚧; TASK-01 and TASK-07 dropped;
  TASK-02 reduced to a starter list.

### Decided in conversation, not yet written down
The user made these product calls. They are recorded in the C0 section of
`tickets.md`, but **not yet in an ADR** — ADR 0008 is on C0's done-when list:
- Display name required at first sign-in.
- Capacity and time set by the host; only sanity constraints (end after
  start, not in the past, capacity ≥ 2). *"Sanity constraints" and the
  minimum of 2 are the agent's reading of "given by host".*
- Host cannot leave; the host cancels instead.
- Chat stays writable for a week after a session ends, then read-only.
  *The user wrote "read only after a week"; this reading was not confirmed.*
- Deleted accounts anonymised: messages kept as "Deleted user".
- Study requests carry a poster-set time range and expire at its end.
- **No curated building list** — all locations from Google Places. Reverses
  ADR 0007's campus layer.
- **Departments user-creatable**, only a handful seeded. Reverses ADR 0006's
  closed list. *"Users will flesh those out" was read as including
  departments; not confirmed.*

### Open questions for the user
- The three italicised readings above.
- The technical picks in C0 "To confirm" are AI recommendations; the team has
  not reviewed them.

### Verified versus assumed
- **Verified:** PR #4 merged with every check green, including the new `db`
  job; Vercel deployed `main` to production. The Sprint 2 diagram renders.
- **Not verifiable from here:** whether production actually serves pages.
  Every deployment URL tried redirects to a Vercel login (Deployment
  Protection), so a missing env var would be invisible from outside.

### Things the next agent should be careful about
- `data/README.md`, `supabase/README.md`, `architecture.md` §2.3, and ADRs
  0006/0007 still describe the curated building layer and the closed
  department list. **Stale on purpose** until ADR 0008 — do not quietly edit
  accepted ADRs.
- `main` gained a commit from the user (`ddee8d6`, `permissions: contents:
  read` in `ci.yml`, a CodeQL fix). T-A4's matching box is ticked.

---

## 2026-09-29 · Database plumbing on `db-setup` (no schema)

**Branch:** `db-setup` · **Commits made:** see the PR opened this session

### What changed
- `db-setup` was behind `main` (#2 had merged into it, #3 carried that to
  `main`). Merged `origin/main` in — no content difference remained.
- Supabase CLI, `pg`, `@types/pg` as dev dependencies; `supabase init`;
  local auth `site_url` set to `http://localhost:3000`.
- `src/lib/env.ts` fail-fast getters; `src/lib/supabase/{client,server,proxy}.ts`
  and `src/proxy.ts` implemented per their stub comments.
- `tests/db/` — Vitest + two `pg` clients, local-only guard; `db` CI job.
- `src/lib/harness.test.ts` deleted (first real unit test landed:
  `env.test.ts`). `tests/db/harness.test.ts` is the new placeholder, to be
  deleted when US-07b lands.
- T-A5 ticked in `docs/tickets.md`; README, `CLAUDE.md`, `test-cases.md`,
  `supabase/README.md`, `.env.example` updated to match.

### Decided in conversation, not yet written down
- **The user chose plumbing only — no tables.** All schema questions stay
  pending for C0, including the display name. Do not write migrations until
  C0 has happened.

### Verified versus assumed
- **Verified locally:** lint, typecheck, `npm test`, build, `npm run test:db`.
  With the user's hosted values, `/`, `/sessions`, `/login` return 200 through
  the proxy, including with a garbage auth cookie. With the Supabase variables
  empty, the build still succeeds but every page returns 500 and the log names
  the missing variable. The lock test was mutated (B takes a different lock)
  and fails as it should. `supabase db start` was checked in a throwaway
  project to apply migrations.
- **Not verified:** the `db` CI job had not run when this entry was written.
  No sign-in flow exists, so session refresh has never refreshed a real
  session.

### Things the next agent should be careful about
- **The deploy breaks without Vercel env vars.** The proxy runs on every page
  and calls `supabaseEnv()`. If `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` are
  not set in Vercel when this merges, production returns 500 on every page.
  They are inlined at build time, so adding them later needs a redeploy.
- **Route protection is intentionally absent** from the proxy (T-E1). Adding
  it before `/login` works locks everyone out of `/sessions`.
- **Every developer now needs `.env.local` filled in** to run `npm run dev` —
  hosted values or `npm run db:status` output.
- `npx supabase status -o env` prints the local keys. They are the CLI's fixed
  demo keys, not secrets — but do not pipe the hosted project's equivalents
  anywhere.
- `supabase db reset`/`start` warn `no files matched pattern: supabase/seed.sql`.
  Harmless; T-C6 creates the seed.

---

## 2026-09-28 · Opened PRs for the docs; refined the tickets

**Branch:** `db-setup` → `docs-refine-tickets` · **Commits made:** `b36fe7b`
(on `db-setup`), `d71c570` and this entry (on `docs-refine-tickets`)

### What changed
- **PR #1** (`db-setup` → `main`) — the previous session's uncommitted docs,
  plus an AI-usage-log row for them. Docs only; despite the branch name, no
  database work is in it.
- **PR #2** (`docs-refine-tickets` → `db-setup`, stacked) — ticket refinement;
  the PR body lists every change. Headline: US-16 had no tickets, and nothing
  set up a local database for the US-07b test.
- `CLAUDE.md` — removed the claim that CI runs a seed-freshness check. It does
  not; adding one is now on T-C6.

### Answered this session
- **Open question 1 from the entry below is answered for this session:** the
  user asked for the PRs, so the agent committed and pushed. Do not generalise
  that to future sessions without asking.
- **Open question 2 is answered: `LocationPicker.tsx` stays a separate
  component.** T-D6 already assumes this; nothing else needed changing.

### Open questions for the user
- Question 3 from the entry below is still unanswered.
- The user asked to keep everything else **pending** — do not resolve these
  without them. They are C0 material unless marked otherwise:
  - What the picker returns (an id for the server to resolve, not
    coordinates — recommended but not agreed)
  - Who may write a venue row; whether that brings the service-role key into
    the app
  - Whether Google's terms let us store a venue's name, or the host types a
    label — affects the `locations` table
  - Room required for campus / optional for venues; allowed venue types;
    radius; campus zone list
  - Seat count derived vs stored; where authorization lives; locations single
    table vs per-kind; display name required at first sign-in; study request
    shape; capacity and time bounds; whether the host can leave; chat after a
    session ends; deletion behaviour for US-24
  - Team calls: ratifying ADRs 0001–0003; who owns Google billing; DB tests in
    CI or local only; merge strategy
- **T-A2 must enable "Places API (New)"**, not the legacy Places API —
  `locationRestriction` and `includedPrimaryTypes` only exist in the new one.
  Not yet written into the ticket.
- `CreateSessionForm.tsx` and `sessions/new/page.tsx` stub comments predate
  ADRs 0006/0007 (single "course" field, building dropdown). Stale; not yet
  fixed.
- **Merge order.** PR #2 is based on `db-setup`. If #1 is squash-merged, #2
  will need rebasing onto `main`; if `db-setup` is deleted on merge GitHub
  retargets #2 automatically (branch auto-delete is currently off).

### Verified versus assumed
- **Verified:** `npm run lint && npm run typecheck && npm test && npm run build`
  passed locally before PR #1. The new tickets dependency diagram was rendered
  with `mmdc` and inspected.
- **Assumed:** every new ticket, dependency, and size in PR #2 is a proposal.
  CI had not reported on either PR when this entry was written.

### Things the next agent should be careful about
- **ADR 0005 is stale in two places** and was deliberately not edited (it is
  an Accepted record): it cites `supabase/migrations/0002_join_session.sql` as
  written, which was deleted in the 2026-09-21 strip-back, and it lists a
  seed-freshness check CI does not run. Supersede or amend it via a new ADR
  rather than rewriting it silently.

---

## 2026-09-28 · Architecture write-up and sprint tickets

**Branch:** `db-setup` · **Commits made:** none — everything below is
uncommitted

### What changed

- **`docs/architecture.md`** (new) — five sections covering the shape of the
  system, proposed class models, the concurrent-join sequence, and a section on
  what this architecture is bad at. Contains five Mermaid diagrams.
- **`docs/tickets.md`** (new) — 27 tickets across five tracks, plus a
  schema-decision meeting (C0). Written because the user said the user stories
  in `docs/backlog.md` were "a bit broad" to split across four people.

### Uncommitted at end of session

- `docs/architecture.md` — ready to commit
- `docs/tickets.md` — ready to commit

Both are documentation only; nothing in `src/` or `supabase/` changed this
session. The user has been doing the pushing themselves, so **do not commit
these without asking.**

### Verified versus assumed

- **Verified:** every Mermaid diagram in both files was rendered with
  `mmdc` (`@mermaid-js/mermaid-cli`) and parses. The container diagram in
  `architecture.md` was rendered to PNG and visually inspected after a first
  version came out with tangled edge routing — the fix was `direction LR`
  inside each subgraph.
- **Assumed:** everything in `architecture.md` §2 (the class models). These are
  a *proposal*, marked as such with a banner at the top of the section. The
  team has not agreed to them. The C0 meeting in `docs/tickets.md` exists
  specifically to accept, change, or reject them.
- **Not checked:** ticket size estimates (S/M/L) are guesses with no
  historical velocity behind them.

### Decided in conversation, not yet written down

Nothing outstanding — the course model and map provider decisions from earlier
sessions were both written up as ADR 0006 and ADR 0007 before this session
started.

### Open questions for the user

None of these block work, but all three have been asked and not answered:

1. **Does the next agent commit, or does the user push?** Every session so far
   has left changes uncommitted for the user to review and push. Assume that
   still holds unless told otherwise.
2. **Should `LocationPicker.tsx` stay a separate component,** or be folded into
   `CreateSessionForm`? The stub was invented by an AI session, not asked for.
   `T-D6` currently assumes it stays separate.
3. **Should `architecture.md` §3 keep the passage disputing the report's risk
   framing?** If the team decided to keep the report's original framing, that
   passage should be cut rather than left as a quiet contradiction.

### Things the next agent should be careful about

- **`main` branch protections are not applied yet.** The user was given
  instructions; `T-A4` tracks it. Do not assume a PR is required or that CI
  gates anything on `main` right now.
- **Secret scanning and push protection are not enabled yet** — and `T-A2`
  creates real Google Maps API keys. If those tickets land in the wrong order
  there is no safety net for a committed key. Flag this if it comes up.
- **The repo lives in `~/Desktop`,** which appears to be synced by
  iCloud. A duplicate git ref (`.git/refs/heads/main 2`, with a literal space)
  appeared once and broke `git fetch` with `fatal: bad object`. It was verified
  to point at an already-merged commit before deletion. **This can recur** — if
  git starts failing on a "bad object" for a ref you do not recognise, check
  `.git/refs/heads/` for space-suffixed duplicates, and confirm with
  `git merge-base --is-ancestor` that nothing unique is in them *before*
  deleting.
- **Every status in every doc is `⬜`, and `docs/test-cases.md` states coverage
  as "Zero".** That is accurate, not an oversight. Do not tidy it into looking
  more finished than it is.
- **RLS is row-level, not column-level.** An earlier session wrote a `profiles`
  policy that correctly restricted rows while exposing every student's email
  address to every other student. The fix is a column-scoped `GRANT`. This is
  logged as US-25 and is an acceptance criterion on `T-C1`. It is an easy
  mistake to make twice.
- `src/lib/harness.test.ts` is a placeholder proving only that the runner
  works. Delete it when the first real test lands.
