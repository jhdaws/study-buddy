# Study Buddy

Find and join study sessions happening across Vanderbilt's campus — by course,
by building, with seats left.

CS 4278: Principles of Software Engineering · Group 4 · Fall 2026
Jack Dawson · Nate Dalbert · Moses Banda · Tapan Sidhwani

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via Supabase, with Row Level Security |
| Auth | Supabase email OTP, restricted to `@vanderbilt.edu` |
| Realtime | Supabase Realtime (no socket server of our own) |
| Map | Google Maps + Places — every location from Places (ADR 0008) |
| Tests | Vitest |
| Hosting | Vercel |

One repository, one deploy target, one database. The reasoning — including
what we rejected and why — is in [`docs/adr/`](./docs/adr/); start with
[ADR 0001](./docs/adr/0001-stack.md).

## Status

**Scaffold plus database plumbing and a schema skeleton.** Routes,
components, and helpers exist as stubs describing what belongs in them. The
Supabase clients, session-refreshing proxy, local database, and database test
harness are real. The Sprint 2 tables exist ([ADR 0008](./docs/adr/0008-sprint-2-schema-decisions.md)),
with Row Level Security on and **no policies yet** — so nothing is readable
through the API until each track adds its own. A starter set of departments
and courses is seeded from [`data/`](./data/), and TypeScript types are
generated from the schema. The screens — header, session list, and the
create-session form — are built and click through end to end, but on
**fixture stubs**: nothing is read from or saved to the database, and nobody
can sign in yet. Every seam the tracks replace is listed in
[`docs/contracts.md`](./docs/contracts.md).

The toolchain is real and green: lint, typecheck, test, and build all pass, and
CI runs them on every push.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the two Supabase values -- see below
npm run dev                  # http://localhost:3000
```

**The Supabase values are required.** Without them every page returns an
error naming the missing variable. Use either the hosted project's values
(ask a teammate) or your local database's (`npm run db:status`).

## Local database

Needs [Docker](https://www.docker.com/products/docker-desktop/) running. The
Supabase CLI is a dev dependency, so there is nothing else to install.

```bash
npm run db:start    # first run downloads images; takes a few minutes
npm run db:status   # URLs and keys for .env.local; Studio at http://127.0.0.1:54323
npm run test:db     # database tests
npm run db:reset    # rebuild from supabase/migrations/ and seed.sql -- wipes local data
npm run db:stop
```

Database tests live in `tests/db/` and refuse to run against anything but a
local database. CI runs them in a separate `db` job.

**Two files are generated — edit their sources, never the files:**

| Generated file | Source | Regenerate with |
| --- | --- | --- |
| `supabase/seed.sql` | `data/*.json` | `npm run db:seed` |
| `src/lib/database.types.ts` | the migrations, via the local database | `npm run db:reset && npm run db:types` |

Commit the generated file with its source. CI regenerates both and fails if
either differs from what is committed — so a PR that adds a migration must
also commit the regenerated types.

### The hosted project

`supabase db push` applies migrations to the hosted project but **does not
load the seed.** To load it as well, run
`npx supabase db push --include-seed` (linked to the hosted project first
with `npx supabase link`). The seed uses `on conflict do nothing`, so running
it again, or against a database where users have already added some of the
same departments or courses, changes nothing that already exists.

## Scripts

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

## Layout

```
src/
  app/
    page.tsx               Landing page
    login/                 Sign-in (US-01)
    auth/confirm/          Sign-in callback
    sessions/              Browse, create, and view sessions
      actions.ts           Server actions: create, join, leave, cancel, message
  components/              SessionBrowser, SessionMap, LocationPicker,
                           SessionRoster, SessionChat
  lib/
    supabase/              Browser, server, and proxy clients
    validation.ts          Schemas shared by forms and actions
    errors.ts              Database error codes -> student-facing messages
    database.types.ts      Generated from the schema (npm run db:types)
  proxy.ts                 Session refresh + route protection
supabase/                  Local config, migrations (schema skeleton, RLS on),
                           and seed.sql (generated from data/)
tests/db/                  Database tests (two-connection harness)
data/                      Starter departments and courses -- source of seed.sql
scripts/build-seed.mjs     Builds supabase/seed.sql from data/ (npm run db:seed)
docs/                      Backlog, acceptance criteria, architecture decisions
```

Many files above are still stubs or return fixtures. Real: `lib/env.ts`,
`lib/supabase/` (except `requireUser()`), `proxy.ts`, `lib/validation.ts`,
the layout and header, and the `/sessions` and `/sessions/new` screens. Each
stub carries a comment describing what it should contain and any constraint
worth knowing before writing it.

## Where things are decided

- [`docs/backlog.md`](./docs/backlog.md) — canonical story IDs, priorities,
  estimates, and what changed from the Requirements Analysis Report
- [`docs/test-cases.md`](./docs/test-cases.md) — Given/When/Then criteria and
  honest coverage status
- [`docs/adr/`](./docs/adr/) — architecture decisions and the corrected risk
  register
- [`docs/ai-usage-log.md`](./docs/ai-usage-log.md) — AI usage log for syllabus
  compliance. **Add an entry when you use AI, not the night before a
  deliverable.**

## Two things settled before writing the database

Both were schema-shaping and expensive to retrofit; both are decided in
[ADR 0008](./docs/adr/0008-sprint-2-schema-decisions.md).

**Where the security boundary lives: in the database.** Row Level Security on
every table, deny by default. Server checks exist only to give good error
messages.

**How a join stays correct under concurrent requests: a database function
holding a row lock.** A plain read-then-insert lets two students take the last
seat at once; the check and the write have to be atomic.
