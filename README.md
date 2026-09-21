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
| Map | Google Maps + Places (curated campus layer on top) |
| Tests | Vitest |
| Hosting | Vercel |

One repository, one deploy target, one database. The reasoning — including
what we rejected and why — is in [`docs/adr/`](./docs/adr/); start with
[ADR 0001](./docs/adr/0001-stack.md).

## Status

**Scaffold only.** Routes, components, and helpers exist as stubs describing
what belongs in them. There is no database, no authentication, and no working
feature yet — that lands in subsequent pushes, starting with the schema.

The toolchain is real and green: lint, typecheck, test, and build all pass, and
CI runs them on every push.

## Getting started

```bash
npm install
cp .env.example .env.local   # values not needed until the database lands
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

CI runs lint, typecheck, tests, and build on every push and pull request.

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
  proxy.ts                 Session refresh + route protection
supabase/                  Schema and migrations. Empty until the database push.
data/                      Seed data (departments, campus buildings). Empty for now.
docs/                      Backlog, acceptance criteria, architecture decisions
```

Every file above is a stub. Each one carries a comment describing what it
should contain and any constraint worth knowing before writing it.

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

## Two things to settle before writing the database

Both are schema-shaping and expensive to retrofit. `supabase/README.md` has the
fuller list.

**Where the security boundary lives.** Enforcing access in the database (Row
Level Security policies) means one rule, checked everywhere, including for
anything that talks to the database directly. Enforcing it in application code
is more familiar but has to be re-applied at every call site. Pick one; doing
both halfway is the bad outcome.

**How a join stays correct under concurrent requests.** Two students taking the
last seat at the same moment must not both succeed. A plain read-then-insert
does not guarantee that — the check and the write need to be atomic.
