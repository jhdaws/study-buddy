# ADR 0001 — One stack, not four

**Status:** Proposed — not yet ratified by the team · **Date:** 2026-09-17

> **Map:** the Leaflet / OpenStreetMap choice below is superseded by
> [ADR 0007](./0007-map-provider.md) — Google Maps and Places. Everything
> else in this record still stands.

## Context

The Requirements Analysis Report specified the stack as a set of alternatives:
React + Vite *or* Next.js; Node/Express *or* FastAPI; PostgreSQL + Prisma *or*
Supabase; Vercel for the frontend *and* Render for the backend. A repository
cannot be laid out against "or" — the choice between Express and FastAPI alone
changes the directory tree, the ORM, the socket library, and the test runner.

We are four people with roughly 6–8 hours each per week for twelve weeks, and
a target of 10–15 active users at launch.

## Decision

**Next.js (App Router) + TypeScript, deployed to Vercel. Supabase for
PostgreSQL, authentication, and realtime. No separate backend service.**

Specifically:

- **Next.js over Vite.** React was already settled; the real question was
  whether to run a second deployable. Next's route handlers and server actions
  give us server-side code without a second service, and server rendering gives
  the public landing page a chance at being found.
- **No Express or FastAPI service.** Moses is strongest in FastAPI, which is a
  genuine argument against this. But a split stack costs us a second repo, a
  second deployment, CORS configuration, a second CI job, and a team where half
  the members cannot read the other half's code. At our size, that tax is larger
  than any individual's home-field advantage.
- **Supabase over self-hosted Postgres + Prisma + Socket.IO.** Supabase
  Realtime broadcasts row changes over websockets, which removes the entire
  real-time workstream from Sprint 3, removes the Render deployment, and removes
  the free-tier cold-start problem that would have made live demos unreliable.
- **No Prisma.** We write SQL migrations and maintain TypeScript types against
  them. Every member has taken CS 3265; writing real schemas, constraints, and
  RLS policies plays to that and produces better material for the report than an
  ORM that hides the schema.
- **No Redis.** It appeared in the report supporting no user-facing requirement.

## Consequences

**Good.** One repository, one deploy target, one database. Sprint 3 loses its
heaviest item. `npm run dev` is the entire local setup once env vars are set.

**Bad.** Authentication and realtime are Supabase-shaped; migrating away would
mean rewriting both. The PostgreSQL schema underneath stays portable.

**Watch.** Row Level Security has a real learning curve and is the one place
this stack can genuinely confuse us. Budget time in Sprint 2 for the whole team
to work through the RLS policies together. (This once named `0001_init.sql`,
which was removed in the 2026-09-21 strip-back; the schema now starts at
`supabase/migrations/*_schema_skeleton.sql` and each track adds its own
policies — ADR 0008.)

## Alternative if this is reversed

Vite + React, Express + Socket.IO, and PostgreSQL — **all three on Render**.
The one combination to avoid is the original Vercel-frontend/Render-backend
split, which pays the cost of two platforms for the benefit of neither.
