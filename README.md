# Study Buddy

[![CI](https://github.com/jhdaws/study-buddy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jhdaws/study-buddy/actions/workflows/ci.yml)
[![Deploy](https://github.com/jhdaws/study-buddy/actions/workflows/deploy.yml/badge.svg)](https://github.com/jhdaws/study-buddy/actions/workflows/deploy.yml)

Find and join study sessions happening across Vanderbilt's campus: by course,
by place, with seats left.

| | |
| --- | --- |
| **Production** | https://study-buddy-jdaws.vercel.app |
| **Staging** | `https://<STAGING_HOST>` <mark>**PLACEHOLDER:** fill in once the first staging deploy has run</mark> (behind Vercel's login; ask a teammate) |
| **Release notes** | [`CHANGELOG.md`](./CHANGELOG.md) and [GitHub Releases](https://github.com/jhdaws/study-buddy/releases) |

CS 4278: Principles of Software Engineering · Group 4 · Fall 2026
Jack Dawson · Nate Dalbert · Moses Banda · Tapan Sidhwani

---

## For graders: test accounts

Sign-in is restricted to `@vanderbilt.edu` addresses, so we made accounts for
you on **production**. Sign in with the email and password; you will not need
an emailed code.

| Account | Email | Password | Use it for |
| --- | --- | --- | --- |
| Grader A | <mark>**PLACEHOLDER:** Jack to provide</mark> | <mark>**PLACEHOLDER**</mark> | hosting a session |
| Grader B | <mark>**PLACEHOLDER:** Jack to provide</mark> | <mark>**PLACEHOLDER**</mark> | joining it from a second browser |

These are the only test accounts in production. Please don't delete them
(Account → Delete account works, and is permanent).

## What it does: a short user guide

1. **Sign in** with your Vanderbilt email. The first time, we email you a
   six-digit code, then you choose a password. After that, email and password
   are enough. "Forgot your password?" sends a new code.
   <mark>[Screenshot: sign-in screen]</mark>
2. **Home** shows the sessions you're hosting or attending, and new sessions
   in your courses. <mark>[Screenshot: Home]</mark>
3. **Browse** open sessions as a list or on a campus map, and filter by
   course. A card shows the place, the time, seats left and who is going.
   <mark>[Screenshot: list and map]</mark>
4. **Join** a session in one tap. Your seat is held, and the roster updates
   live for everyone. **Leave** frees the seat again. A full session says so.
5. **Host** a session: course, topic, a place on campus (from Google Places),
   room, time and seats. You can repeat it weekly, edit it, or cancel it.
   <mark>[Screenshot: create a session]</mark>
6. **Chat** with everyone in a session from its page, and add it to your
   calendar (`.ics`). <mark>[Screenshot: session page with chat]</mark>
7. **Can't find a session?** Post a study request for your course so
   classmates see the interest.
8. **Stay safe:** report or block another student from a session's roster; blocked
   students stop seeing each other's sessions. Your email is never shown to
   anyone.
9. **Your profile** holds your major, minor, year and courses. **Account**
   lets you sign out or delete your account and data.

What changed in each version is in [`CHANGELOG.md`](./CHANGELOG.md).

---

## Run it locally

### One command (Docker)

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/) and
Git, nothing else.

```bash
git clone https://github.com/jhdaws/study-buddy.git
cd study-buddy
cp .env.example .env
docker compose up --build
```

Open http://localhost:3000. Compose builds the app image and starts a local
Supabase stack (database, Auth, API, Realtime). Sign-in codes don't leave
your machine: read them at http://localhost:54324 (Mailpit). Leave the keys
in `.env` empty; `docker-compose.yml` fills in the local stack's public demo
values. Stop with `Ctrl-C`, then `docker compose down`.

> **Known issues under Compose** (`docs/bug_database.md`): session chat and
> the live roster can't reach the database from the browser (BUG-24), and
> creating a session fails without a Google key (BUG-25). Both are open. The
> path below has neither.

### For development (Node.js)

Needs Node.js 22 and Docker (for the local database).

```bash
npm ci
npm run db:start          # local Supabase in Docker; prints URLs and keys
cp .env.example .env.local
# put API_URL and the anon (publishable) key from `npm run db:status` into
# NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev               # http://localhost:3000
```

Without Google keys, the place picker offers three test places, which is
enough to try every feature. `.env.example` explains every setting.

## Run the tests

| Level | Command | Needs | What it covers |
| --- | --- | --- | --- |
| Unit and component | `npm test` | nothing | validation, error messages, seat maths, components, the release gate |
| Coverage | `npm run test:coverage` | nothing | the same, failing below the thresholds in `vitest.config.mts` |
| Database | `npm run test:db` | `npm run db:start` | constraints, Row Level Security, locks and functions in real Postgres (`tests/db/`) |
| End to end | `npx playwright install chromium`, then `npm run test:e2e` | `npm run db:start` | the main journeys in a real browser against a production build (`tests/e2e/`) |
| Smoke | runs in GitHub Actions after every staging deploy | staging | `.github/workflows/smoke-tests.yml` |

The database and end-to-end tests refuse to run against anything but a local
database, because they create users. Before opening a pull request, run what
CI runs first: `npm run lint && npm run typecheck && npm test && npm run build`.
[`TEST_PLAN.md`](./TEST_PLAN.md) has the strategy; [`docs/test-cases.md`](./docs/test-cases.md)
says honestly what each story's tests prove.

## How a change reaches production

Every pull request runs [`ci.yml`](./.github/workflows/ci.yml): lint,
typecheck, unit tests with a coverage gate, build, database tests, browser
journeys, a Docker image build, and a security stage (dependency audit,
Semgrep, gitleaks). `main` is protected: green checks and a teammate's
approval are required.

Once CI passes on `main`, [`deploy.yml`](./.github/workflows/deploy.yml)
applies new migrations to the staging database, deploys the commit to
staging, and runs the smoke tests there. A `v*` tag on a commit whose staging
smoke run is green deploys it to production, after a teammate approves.
Vercel itself deploys nothing (`vercel.json`). The diagram is in
[`docs/deployment.md`](./docs/deployment.md); deploying, promoting and rolling
back by hand are in [`docs/ops/RUNBOOK.md`](./docs/ops/RUNBOOK.md).

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL on Supabase, Row Level Security on every table |
| Auth | Supabase email codes and passwords, `@vanderbilt.edu` only |
| Realtime | Supabase Realtime (live roster, chat) |
| Map | Google Maps + Places |
| Tests | Vitest, Testing Library, Playwright |
| Hosting | Vercel (staging and production), Supabase (one project each), image on GHCR |

The reasons, and what we rejected, are in [`docs/adr/`](./docs/adr/): start
with [ADR 0001](./docs/adr/0001-stack.md), and
[ADR 0012](./docs/adr/0012-hosting-and-release.md) for hosting.

## Working on the code

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Database tests — needs `npm run db:start` first |
| `npm run db:start` / `db:stop` | Start or stop the local Supabase stack |
| `npm run db:reset` | Rebuild the local database from migrations, then load `supabase/seed.sql` |
| `npm run db:seed` | Regenerate `supabase/seed.sql` from `data/` — writes the file only; `db:reset` loads it |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the local database |
| `npm run db:status` | Local URLs and keys |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

CI runs lint, typecheck, tests, and build on every push and pull request, plus
the database tests in a separate job. It also fails if `supabase/seed.sql`
or `src/lib/database.types.ts` is out of date.


**Two files are generated — edit their sources, never the files:**

| Generated file | Source | Regenerate with |
| --- | --- | --- |
| `supabase/seed.sql` | `data/*.json` | `npm run db:seed` |
| `src/lib/database.types.ts` | the migrations, via the local database | `npm run db:reset && npm run db:types` |

Commit the generated file with its source. CI regenerates both and fails if
either differs from what is committed — so a PR that adds a migration must
also commit the regenerated types.


Schema changes are new migrations only (`npx supabase migration new <name>`);
never edit one that has been applied. Conventions for contributors, human or
AI, are in [`CLAUDE.md`](./CLAUDE.md).

## Where things are decided

- [`docs/backlog.md`](./docs/backlog.md) — canonical story IDs, priorities,
  estimates, and what changed from the Requirements Analysis Report
- [`docs/tickets.md`](./docs/tickets.md) — the current sprint, by track; status
  is tracked on the [GitHub project](https://github.com/users/jhdaws/projects/1)
- [`docs/contracts.md`](./docs/contracts.md) — every stub the tracks replace,
  its signature, and its owner
- [`docs/architecture.md`](./docs/architecture.md) — system shape and the
  agreed data model
- [`HANDOFF.md`](./HANDOFF.md) — what each working session left for the next
- [`docs/test-cases.md`](./docs/test-cases.md) — Given/When/Then criteria and
  honest coverage status
- [`docs/adr/`](./docs/adr/) — architecture decisions and the corrected risk
  register
- [`docs/ai-usage-log.md`](./docs/ai-usage-log.md) — AI usage log for syllabus
  compliance. **Add an entry when you use AI, not the night before a
  deliverable.**

## Future work

What we would do next, roughly in order:

- **Fix the Compose setup** (BUG-24 to BUG-26) so `docker compose up` runs
  every feature, not only most.
- **Sessions near me** (US-12): filter by distance instead of the campus
  zones the old building list would have given us.
- **Ratings** (US-14): rate a session and its host afterwards.
- **A phone app.** An Expo app was started (#146) but not merged.
- **Serve the Docker image in production** instead of rebuilding on Vercel,
  if "one image, every environment" matters more than Vercel's tooling
  (ADR 0012, "Revisit if").
- **Check hosted auth settings in CI** (ADR 0009), so the dashboard and
  `supabase/config.toml` cannot drift apart.

<mark>**PLACEHOLDER:** remove any item above that ships before 12/8 (US-10, US-13 and US-18 are planned for Sprint 5 and are not listed).</mark>

## Two things settled before writing the database

Both were schema-shaping and expensive to retrofit; both are decided in
[ADR 0008](./docs/adr/0008-sprint-2-schema-decisions.md).

**Where the security boundary lives: in the database.** Row Level Security on
every table, deny by default. Server checks exist only to give good error
messages.

**How a join stays correct under concurrent requests: a database function
holding a row lock.** A plain read-then-insert lets two students take the last
seat at once; the check and the write have to be atomic.
