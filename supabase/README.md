# Supabase

Local development is set up — `config.toml`, and `npm run db:start` brings up
the whole Supabase stack in Docker (see the root README). The schema is
agreed in [ADR 0008](../docs/adr/0008-sprint-2-schema-decisions.md).

## What goes here

```
supabase/
  migrations/        Timestamped SQL migrations, applied in filename order
  seed.sql           Starter data loaded by `supabase db reset` (W3)
  config.toml        Created by `supabase init`
```

## The schema today

One migration, `migrations/*_schema_skeleton.sql` (W2), creates every
Sprint 2 table as **structure only**: `profiles`, `departments`, `courses`,
`locations`, `sessions`, `session_attendees`, and the `session_status` enum.
The migration's header says which track owns which table.

**Row Level Security is enabled on every table, with no policies.** Nothing
is readable or writable through the Data API until the owning track adds its
policies. That is intended — a missing policy fails closed. Do not add broad
policies to "make it work". `tests/db/rls.test.ts` fails if any table in
`public` is created without RLS.

The rules each track adds, in its own migration:

| Track | Adds |
| --- | --- |
| A2 | Signup triggers (Vanderbilt-only, create the profile row); profile policies |
| S1 | Session `CHECK`s; `create_session`; session and roster policies |
| S2 | Normalisation and create-on-use for departments and courses; their policies |
| M3 | Read policy on `locations`; rows written only by the server |

Decisions every migration should respect (ADR 0008):

- **Seats left are derived** from `session_attendees`, never stored.
- **Joining goes through a database function holding a row lock** (later
  sprint) — never a plain client `INSERT`.
- **Email is never copied into `profiles`.** It stays in `auth.users`.
- **Views bypass RLS** unless created `with (security_invoker = true)`.

## Adding a migration

```bash
npx supabase migration new <name>   # one per PR
npm run db:reset                    # re-applies every migration, then seed.sql
npm run db:types                    # regenerate src/lib/database.types.ts -- commit it
npm run test:db                     # includes the RLS guard and the seed check
```

Never edit a migration once it has merged; add a new one. CI fails if the
committed `database.types.ts` does not match the migrations.

`seed.sql` is generated from `data/` by `npm run db:seed` — edit the JSON,
not this file. See [`data/README.md`](../data/README.md).
