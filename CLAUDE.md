# Study Buddy — working conventions

Read [`AGENTS.md`](./AGENTS.md) too: it is maintained by Next.js itself and
warns that this version differs from older Next.js you may have seen.

**Start every session by reading the top entry of [`HANDOFF.md`](./HANDOFF.md),
and end every session by adding a new one.** It carries what the docs cannot:
uncommitted work, unanswered questions, and approaches that were tried and
failed. The template and the rules for writing an entry are in that file.

## Current state

Sprint 4 is done (2026-11-12); `docs/backlog.md` has what is finished and the
backlog-done percentage. The app runs on Vercel against hosted Supabase:
sign-in by emailed code then a password, Vanderbilt only; create, edit,
cancel, join and leave sessions with a live roster; a list and a map; study
requests; course filter; academic profile; report, block and delete account;
Home about the student. Every table has RLS and policies, and the client roles
hold only the grants the app uses (SEC-14). Writes that need a rule enforced
go through SECURITY DEFINER functions, and rate limits live in the database
(ADR 0011). The security audit is in `docs/security/`.

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

Two rules from the Sprint 4 AI-code audit (`docs/security/ai-code-audit.md`):

- **When your change makes another file's comment wrong, fix that comment in
  the same PR.** Before finishing, search `src/`, `supabase/` and `docs/` for
  the names of what you changed, and update any comment that argues from the
  old behaviour, security comments first.
- **A security control you put off gets an ID in the same PR**: a row in
  `docs/security/findings.md` or a ticket, not only a "not done yet" comment.

## Before you open a PR

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI runs exactly this, plus a seed-freshness check (`supabase/seed.sql` must
match `data/`) and, in the `db` job, a check that `src/lib/database.types.ts`
matches the migrations, plus the `security` job (npm audit, Semgrep,
gitleaks), which fails on a High finding.

Add at least one failure-path or accessibility check to every PR, not only the
happy path. Group 3's review of #85 found two problems our tests could not
see: a quick remount, and what a screen reader hears
(`docs/code-review/group3-review-received.md`).

## Testing

Unit tests sit next to the code as `*.test.ts`. Pure logic — validation, error
mapping, seat maths — is unit tested with `npm test`. What to test next, at
which level, and the coverage targets are in [`TEST_PLAN.md`](./TEST_PLAN.md);
`npm run test:coverage` measures branch coverage over all of `src/`.

Anything needing real Postgres behaviour — constraints, RLS, locks — goes in
`tests/db/` and runs with `npm run test:db` against the local database
(`npm run db:start`, needs Docker). Those tests refuse to connect anywhere but
localhost. CI runs them in a separate `db` job.

The main journeys run in a real browser with `npm run test:e2e` (Playwright,
`tests/e2e/`): a production build against the full local stack, with
sign-in codes read from Mailpit. They refuse any non-local Supabase, because
they create users. CI runs them in the `e2e` job.

`docs/test-cases.md` tracks what is genuinely verified versus what is
assumed — keep it honest, because a green CI badge should never imply
coverage we do not have.

## Bugs

Found a defect — not just "this isn't built yet," an actual "this was wrong"?
Log it in [`docs/bug_database.md`](./docs/bug_database.md), even if you fix
it in the same sitting. It is the project's index of what broke and why;
`test-cases.md` tracks story coverage, this tracks defects.
