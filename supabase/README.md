# Supabase

Local development is set up — `config.toml`, and `npm run db:start` brings up
the whole Supabase stack in Docker (see the root README). **There are no
migrations yet, on purpose:** the schema is written once the team has agreed
what it looks like (C0 in `docs/tickets.md`).

## What goes here

```
supabase/
  migrations/        Numbered SQL migrations, applied in filename order
  seed.sql           Reference data loaded by `supabase db reset`
  config.toml        Created by `supabase init`
```

## Before writing the first migration

Decide these as a team — they are schema-shaping and expensive to change later:

- **Tables and relationships.** Sessions, attendees, messages, profiles at
  minimum. What else?
- **Where capacity is enforced.** A stored attendee count is easy to read and
  easy to let drift; a derived count cannot drift but costs a join. Pick one
  deliberately.
- **How a join stays correct under concurrent requests.** Two students taking
  the last seat at the same moment must not both succeed.
- **Authorization model.** Row Level Security policies in the database, or
  checks in application code. Doing both halfway is the bad outcome.
- **Reference data.** Courses settled by ADR 0006 (seeded departments, course
  numbers learned from use); locations by ADR 0007 (curated campus buildings
  plus Google Places venues). Both need tables. See `data/README.md`.

See `docs/adr/` for the earlier thinking, but treat it as input rather than a
settled decision — the schema discussion has not happened yet.
