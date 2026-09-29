# ADR 0005 — CI in Sprint 1, and the real risk register

**Status:** Accepted · **Date:** 2026-09-17

> **Note, 2026-09-29:** two statements below were true when written and are
> not now. The join function it cites (`0002_join_session.sql`) was removed in
> the 2026-09-21 strip-back; the row-locked join is a later-sprint ticket
> (`docs/tickets.md`, "Later sprints"). The seed-freshness check it lists was
> not in `ci.yml` until W3 added it, alongside a generated-types check. The
> decision itself stands.

## Context

The project plan scheduled CI twice — once at milestone P2.5 (Oct 8) and again
in Sprint 3 (Oct 20). Sprint 3 also carried the Leaflet map *and* real-time
messaging, making it by a wide margin the heaviest sprint, and it lands
immediately before Fall Break (Oct 22–23).

## Decision

**CI runs from Sprint 1.** `.github/workflows/ci.yml` runs lint, typecheck,
unit tests, build, and a seed-freshness check on every push and pull request.
It is about an hour of setup and it guards every merge for the remaining eleven
weeks.

Combined with ADR 0001 removing the real-time workstream from Sprint 3, that
sprint is now the map plus usability fixes — survivable alongside Fall Break.

## The risk register, corrected

The report named **concurrent claims on the last open seat** as "the single
most serious challenge in delivering the product on schedule". It is not. At
10–15 users, two students clicking Join within the same few milliseconds will
approximately never happen, and the mitigation is about twenty lines of
PL/pgSQL — `supabase/migrations/0002_join_session.sql`, written on day one.

It is worth doing correctly, and we did. It was never a schedule risk.

The risks that could actually cost us the semester, in order:

1. **Authentication blocked by an external dependency.** Mitigated by ADR 0003:
   magic links depend on no one's approval. This was the largest risk and it is
   now closed.
2. **Four people merging into one codebase for the first time.** Mitigated by
   CI from Sprint 1, a single stack (ADR 0001), and `CLAUDE.md` recording
   conventions. Unproven until we are genuinely working in parallel.
3. **Real-time chat under-estimated.** The backlog priced US-05 at 16 hours.
   With persistence, authorization, reconnection, and message attribution, 30
   is more honest — and that was *before* we simplified it by dropping
   Socket.IO. Re-estimate after Sprint 2.
4. **An empty map at launch.** Nobody joins an empty map, so it stays empty.
   Mitigated by promoting US-16 (post a study request) to P0 and by a
   deliberate empty state that recruits the visitor into hosting.

## Consequences

We should rewrite the risk section of the report along these lines. "We
identified a concurrency risk and closed it in twenty lines; here is what
actually threatened the schedule" is a stronger and more honest engineering
narrative than a race condition we were never going to hit.
