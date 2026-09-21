# Architecture decision records

Short records of decisions that were expensive to make and would be expensive
to reverse. Each one states the context, the decision, and — importantly — what
was rejected and why.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](./0001-stack.md) | **Proposed**, partly superseded | One stack: Next.js + Supabase, no separate backend service |
| [0002](./0002-reference-data.md) | Partly superseded | Buildings and courses as hand-maintained seed data |
| [0003](./0003-authentication.md) | **Proposed** | Vanderbilt-only sign-in by emailed magic link |
| [0004](./0004-mobile-first.md) | Accepted | Mobile-first; list view before map |
| [0005](./0005-ci-in-sprint-one.md) | Accepted | CI from Sprint 1, and a corrected risk register |
| [0006](./0006-course-model.md) | Accepted | Courses: seeded departments, course numbers learned from use |
| [0007](./0007-map-provider.md) | Accepted | Google Maps + Places, with a curated campus building layer |

## On "Proposed"

0001, 0002, and 0003 were written during an AI-assisted review and have **not
been ratified by the team**. They are the reasoning on the table, not a
settled outcome:

- **0001** overrides the stack named in the submitted Requirements Analysis
  Report, and drops the FastAPI backend one team member is strongest in. That
  is a team call. Its map choice (Leaflet) has since been replaced by 0007.
- **0002** is fully superseded: courses by 0006, locations by 0007. Kept for
  the record only.
- **0003** makes assumptions about the database that the schema discussion
  (TASK-00) may change.

Ratify or overrule them as a team, then update the status here. If the report's
technical section ends up disagreeing with an accepted ADR, the report is what
needs revising.

## Writing a new one

Copy the shape of an existing file: Context, Decision, Consequences (good, bad,
and what to watch), and what you rejected. The rejected options are the part
future-you will actually want.
