# ADR 0006 — Courses: closed department list, open course numbers

**Status:** Accepted · **Date:** 2026-09-21
**Supersedes:** the course half of [ADR 0002](./0002-reference-data.md)

## Context

The Requirements Analysis Report claimed "granular university course catalog
integration" as a core differentiator. There is no public, documented
Vanderbilt course catalog API we can depend on for a semester, and
hand-transcribing the full catalog is not realistic — it is thousands of
courses across every school, and it goes stale every term.

But the problem splits cleanly in two:

- **Department / subject codes are a closed set.** Roughly 100–150 of them,
  published, and they barely change year to year. Enumerable in an afternoon.
- **Course numbers are an open set.** Thousands, changing every term. Not
  enumerable by us.

Treating both halves the same way is what made the original plan impossible.

## Decision

**Seed the departments. Learn the courses.**

A student entering a course fills in two separate fields:

1. **Department** — chosen from a closed, seeded list. Not free text.
2. **Course number** — typed, with typeahead over numbers already recorded for
   that department.

The first person to enter a given number creates the course row. Everyone after
gets it as a suggestion. The catalog grows to fit actual usage and never
contains a course nobody studies.

### Schema sketch

```
departments
  code          text primary key      -- 'CS', 'MATH', canonical uppercase
  name          text                  -- 'Computer Science'

courses
  id            uuid primary key
  department_code  text references departments(code)
  number        text                  -- '3251', normalized
  title         text null             -- optional, crowdsourced
  merged_into   uuid null references courses(id)
  created_by    uuid references profiles(id)
  created_at    timestamptz
  unique (department_code, number)
```

Session rows reference `courses.id`, not a denormalized code string.

### Normalization is mandatory on write

`cs 3251`, `CS-3251`, `Cs3251`, and `CS 3251` must all resolve to one row.
Uppercase the department, strip whitespace and punctuation from the number,
store the canonical form. Skipping this produces four rows for one course
inside a week, and the suggestion list becomes useless.

### Validation

- Department **must** exist in `departments`. This is what keeps the data from
  degenerating into free text.
- Number must match an agreed pattern. Vanderbilt course numbers appear to be
  four digits with an occasional letter suffix — **verify this against the
  catalog before locking the regex**, particularly whether any school uses a
  different form.

### Suggestion ranking

Order the typeahead by how many sessions have used each course, descending.
Show the count inline:

```
CS 3251 · 14 sessions
CS 3252 · new
```

Derive the count from the sessions table rather than storing a counter — at our
scale the join is free, and a stored count can drift from reality.

When a student types a number that does not exist yet, say so plainly rather
than silently accepting it:

> *CS 3892 — nobody's studied this yet. Create it?*

## Consequences

**Good.** No catalog transcription, no scraping, no external dependency. The
data stays proportional to real usage. TASK-02 shrinks from "build the course
catalog" to "compile the department list", which is genuinely achievable.

**Good, for the report.** We can stop claiming catalog *integration* — which we
are not building — and describe what we actually built: course-scoped
discovery over a crowd-grown course list. That is an honest claim a reader can
verify.

**Bad: typos become permanent suggestions.** If the first person to study
CS 3251 types `3521`, that typo is now offered to everyone. Three mitigations,
all cheap:

1. Usage ranking floats real courses and sinks typos.
2. The inline session count lets a student see which entry looks wrong.
3. `merged_into` exists from day one, so duplicates can be cleaned up later
   without a migration.

**Do not build a merge UI now.** The column is enough. Revisit if the data
actually degrades.

**Watch:** `title` is optional deliberately. Requiring it means the first
person types "swe" and that becomes the title everyone sees. Better empty than
wrong.

## Rejected

- **Full catalog transcription** — thousands of rows, stale every term, and it
  was never going to happen.
- **Scraping YES** — fragile, likely needs authentication, and not something a
  graded project should depend on.
- **Free-text course entry** — no validation, no filtering, no suggestions. The
  closed department list is what makes the open half workable.
- **A single combined `CS 3251` text field** — harder to validate, harder to
  filter by department, and harder to build a two-stage picker against.
