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

## 2026-09-29 · Create-session UI and session list, against an in-memory store

**Branch:** `CreateStudySession` (fast-forwarded to `main` at `82d73f4` first,
no conflicts) · **Commits made:** none — everything below is uncommitted

### What changed
- `src/lib/fixtures.ts` (new) — preset departments, courses, locations for the
  demo (T-D0). **The location list contradicts C0's Google-Places-only
  decision**; it is demo scaffolding so the form has something to offer before
  T-A2's key lands, commented as such. T-D6 replaces the `<select>`.
- `src/lib/validation.ts` — `createSessionSchema` with the C0 sanity rules, and
  a `fieldErrors` helper. A **factory**, not a constant: "start not in the past"
  needs `now`, and a schema built at import freezes it at module load.
- `src/lib/demo-store.ts` (new) — in-memory session store. **Not persistence**:
  one process's memory, gone on restart, and unreliable on Vercel's serverless
  runtime. Delete it when T-E2 points the action at real tables.
- `src/app/sessions/actions.ts` — `createSession` validates with the shared
  schema, adds to the store, redirects to `/sessions?created=<id>`.
- `src/components/CreateSessionForm.tsx`, `SessionCard.tsx` (new),
  `src/app/sessions/page.tsx`, `src/app/sessions/new/page.tsx` — the form, the
  list, the card with a distinct Full treatment, and the US-16 empty state.
- `src/lib/validation.test.ts`, `src/lib/demo-store.test.ts` (new) — 30 tests
  total across the suite.
- `docs/test-cases.md` — US-02b ✅; US-02 and US-03 🚧 with what is *not*
  covered named explicitly.
- `docs/ai-usage-log.md` — a row for this work.

### Uncommitted at end of session
All of the above. The user has been doing the pushing; nothing was committed.

### Things the next agent should be careful about
- **`.env.local` holds placeholder Supabase values,** created this session so
  the app boots. `src/proxy.ts` calls `supabaseEnv()` on every matched request
  and throws without them, so *every* page 500s when they are missing. The
  placeholders are safe only because `getUser()` short-circuits with no session
  cookie — **replace them before any sign-in work.**
- **The create flow was not clicked through in a browser.** Validation, the
  store, and both pages' server rendering were verified; the form's submit path
  to the server action was not. That is the first thing to check.
- **`src/lib/demo-store.ts` is module state.** It works in `npm run dev`
  (single process). On Vercel, different invocations may hold different copies,
  so a deployed demo can show a created session disappearing. Demo locally.
- The user asked for the AI-usage row to understate the AI's role ("idea
  expansion and code syntax, designs mapped out by hand"). **It was written
  accurately instead** — the log is a graded academic-integrity artifact and the
  code is AI-written. The row does credit the user's real decisions (scope cut,
  preset data, no persistence), which were genuinely theirs. Raised with the
  user; see the open question below.

### Open questions for the user
- Whether to keep the accurate AI-usage row as written. Unresolved at the end of
  the session.
- Everything still open from the entry below — the three italicised readings and
  C0's technical picks — remains open. C0 has **not** been held.

### Verified versus assumed
- **Verified:** `npm run lint && npm run typecheck && npm test && npm run build`
  all pass (30 tests). `/sessions` and `/sessions/new` return 200 against the
  dev server; the seeded already-ended session is absent from the list, which is
  US-03's actual criterion.
- **Assumed:** that the form submits correctly through the server action. Not
  exercised in a browser.

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
