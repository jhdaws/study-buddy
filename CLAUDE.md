# Study Buddy — working conventions

Read [`AGENTS.md`](./AGENTS.md) too: it is maintained by Next.js itself and
warns that this version differs from older Next.js you may have seen.

**Start every session by reading the top entry of [`HANDOFF.md`](./HANDOFF.md),
and end every session by adding a new one.** It carries what the docs cannot:
uncommitted work, unanswered questions, and approaches that were tried and
failed. The template and the rules for writing an entry are in that file.

## Current state

Sprint 2 is in progress (`docs/tickets.md`). The database has a schema
skeleton (RLS on), a seed of starter departments and courses, and generated
TypeScript types; the hosted project has the same. The only policy so far is
M3's: signed-in users may read `locations`, and client write grants on it are
revoked — that migration **has not yet been run against any database** (see
`HANDOFF.md`). Every other table still has **no policies**.
The screens — header, session list, create-session form — are built, but on
**stubs returning fixture data**: nothing is saved or read, and nobody can
sign in yet. Every stub, its owner, and what its real body must do is in
`docs/contracts.md`. Routes and components for later sprints are still
comment-only stubs.

**Read the stub comment before you fill one in** — several record a constraint
that is easy to miss and expensive to get wrong.

## Conventions

- **Story IDs.** `docs/backlog.md` is canonical. Use `US-nn` in commit
  subjects and PR titles. Branches are named after the ticket and story
  (`s3-us-02-create-session`); ticket IDs are in `docs/tickets.md`.
- **Schema changes are migrations.** Create one with
  `npx supabase migration new <name>` (timestamped, in
  `supabase/migrations/`); never edit one that has already been applied.
  Commit the regenerated `src/lib/database.types.ts` with it — CI checks.
- **Validation lives in `src/lib/validation.ts`** and is shared by a form and
  the server action behind it (its length limits live in `src/lib/limits.ts`,
  so Client Components can import them without shipping zod). Those rules should mirror the database
  constraints — the database is the real enforcement, this layer is for a good
  error message.
- **Database errors reach users through `src/lib/errors.ts`.** Never surface
  raw Postgres text; add a mapping instead.
- **Server by default.** Components are Server Components unless they need
  state, effects, or browser APIs. Realtime subscriptions and the map are
  necessarily client-side.
- **Mobile first.** Single column, 44px tap targets, `text-base` on inputs so
  iOS does not zoom. See `docs/adr/0004-mobile-first.md`.

## AI usage

The course requires an AI usage log. It lives at `docs/ai-usage-log.md`.

If you used AI to write, design, or debug something in a PR, add a row **in
that PR** — the log is part of the change, not a separate chore. Leave
"Verified by" as `⬜ pending` until a human has genuinely reviewed the output;
putting your name there is a claim that you understood it and would defend it.

## Before you open a PR

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI runs exactly this, plus a seed-freshness check (`supabase/seed.sql` must
match `data/`) and, in the `db` job, a check that `src/lib/database.types.ts`
matches the migrations.

## Testing

Unit tests sit next to the code as `*.test.ts`. Pure logic — validation, error
mapping, seat maths — is unit tested with `npm test`. What to test next, at
which level, and the coverage targets are in [`TEST_PLAN.md`](./TEST_PLAN.md);
`npm run test:coverage` measures branch coverage over all of `src/`.

Anything needing real Postgres behaviour — constraints, RLS, locks — goes in
`tests/db/` and runs with `npm run test:db` against the local database
(`npm run db:start`, needs Docker). Those tests refuse to connect anywhere but
localhost. CI runs them in a separate `db` job.

`tests/db/harness.test.ts` only proves the database harness works. **Delete it
once US-07b lands.** `docs/test-cases.md` tracks what is genuinely verified
versus what is assumed — keep it honest, because a green CI badge should never
imply coverage we do not have.
