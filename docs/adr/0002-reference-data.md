# ADR 0002 — Buildings and courses are seeded static data

**Status:** Superseded · **Date:** 2026-09-17

> **Courses:** superseded by [ADR 0006](./0006-course-model.md) — departments
> are seeded, course numbers are learned from use. Ignore this document's
> course reasoning.
>
> **Locations:** superseded by [ADR 0007](./0007-map-provider.md) — Google
> Maps and Places, with a curated campus building layer.
>
> This record is kept for the reasoning it captures, not as guidance.

## Context

The report names "granular university course catalog integration" as a core
differentiator against Meetup and Google Calendar, and the map requires
Vanderbilt building names with coordinates. Neither had a user story, an owner,
or an hour estimate anywhere in the plan — they were assumed into existence.

There is no public, documented API for the Vanderbilt course catalog that we
can rely on for a semester. Scraping YES would be fragile, would likely require
authentication, and is not something we want a graded project to depend on.

## Decision

**Both are hand-maintained JSON seeds, committed to the repository.**

- `data/buildings.json` — id, name, campus zone, latitude, longitude
- `data/courses.json` — course code, title

`scripts/generate-seed.mjs` compiles both into `supabase/seed.sql`, which the
Supabase CLI applies on `supabase db reset`. The JSON is the source of truth;
`seed.sql` is a generated artifact that is committed so a database reset works
without running Node first. CI fails if the two drift.

## Consequences

**Good.** No external dependency, no scraping, no auth. Adding a course is a
one-line pull request any team member can review.

**Bad.** The catalog is incomplete and will stay incomplete. **A student who
cannot find their course cannot create a session** — so an incomplete catalog
is a silent failure during user testing, not a cosmetic gap. Expand it before
the Sprint 3 test with real students.

**Coordinates are currently unverified.** Every building in `data/buildings.json`
carries `"verified": false`. The values are approximate and were not checked
against a real map. Pins are wrong until someone does that work — tracked as
TASK-01.

## Honest framing for the report

We should stop describing this as "course catalog integration". It is a seeded
course list, and the differentiator is really *course-scoped session
discovery* — which works fine on a seeded list. Claiming integration we did not
build is the kind of thing a reader will check.
