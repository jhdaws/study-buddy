# Study Buddy — working conventions

Read [`AGENTS.md`](./AGENTS.md) too: it is maintained by Next.js itself and
warns that this version differs from older Next.js you may have seen.

## Current state

This repository is a scaffold. Every route, component, and helper is a stub
carrying a comment describing what belongs in it. There is no database, no
auth, and no working feature yet.

**Read the stub comment before you fill one in** — several record a constraint
that is easy to miss and expensive to get wrong.

## Conventions

- **Story IDs.** `docs/backlog.md` is canonical. Use `US-nn` in branch names
  (`us-04-join-session`), commit subjects, and PR titles.
- **Schema changes are migrations.** Add a new numbered file in
  `supabase/migrations/`; never edit one that has already been applied.
- **Validation lives in `src/lib/validation.ts`** and is shared by a form and
  the server action behind it. Those rules should mirror the database
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

CI runs exactly this, plus the seed-freshness check.

## Testing

Unit tests sit next to the code as `*.test.ts`. Pure logic — validation, error
mapping, seat maths — is unit tested; anything needing a live database is not
yet possible.

`src/lib/harness.test.ts` is a placeholder that only proves the runner works.
**Delete it once a real test lands.** `docs/test-cases.md` tracks what is
genuinely verified versus what is assumed — keep it honest, because a green CI
badge should never imply coverage we do not have.
