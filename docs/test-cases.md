# Acceptance criteria (Given / When / Then)

Every case cites a story ID from [`backlog.md`](./backlog.md) and names how it
will be verified. In the report's Part C these IDs did not match Part A — that
is fixed here.

Once tests exist, the "Verified by" column should name the actual file, so the
mapping stays honest as the code changes.

Status: ⬜ not yet written · 🚧 partially covered · ✅ automated and passing

**Almost everything is ⬜.** An earlier scaffold had 15 passing unit tests; it
was stripped back so the schema can be designed first. Most tests in the repo
cover environment configuration and prove the database harness works — neither
verifies any row below.

The exception is US-02b, genuinely covered as of the create-session work. US-02
and US-03 are 🚧: the behaviour is demonstrable in the running app, but against
the **in-memory demo store** (`src/lib/demo-store.ts`), not a database. Nothing
below has been verified against real Postgres, real auth, or a real map.

| ID | Status | Given | When | Then | Verified by |
| --- | --- | --- | --- | --- | --- |
| US-01 | ⬜ | An unregistered student is on the sign-in screen | They submit a valid `@vanderbilt.edu` address | A one-time sign-in link is emailed; non-Vanderbilt addresses are rejected with a specific message | Unit test + a database-level domain check |
| US-01b | ⬜ | An attacker calls the auth API directly with a non-Vanderbilt address | The request bypasses our sign-in form | The database trigger rejects it | DB integration test — TASK-03 |
| US-02 | 🚧 | A signed-in student is on Create Session | They submit course, topic, building, room, time range, capacity | The session is saved, the host is added to the roster, and a pin appears on the map | `src/lib/demo-store.test.ts` covers the host landing on the roster. **Not saved** (in-memory only, T-E2), **no sign-in** (T-E1), **no map pin** (T-D5) |
| US-02b | ✅ | A signed-in student is on Create Session | They submit an end time before the start, or a time in the past | Submission is blocked with a field-level error | `src/lib/validation.test.ts` — both cases, plus capacity and required fields |
| US-03 | 🚧 | Three upcoming sessions and one ended session exist | A signed-in student opens the map | Three pins appear, the ended one does not; tapping a pin shows course, time, and seats left | `src/lib/demo-store.test.ts` asserts the ended session is excluded and the list is ordered. **List, not map** (T-D5); against the demo store, not a database |
| US-04 | ⬜ | A signed-in student views an open session with space | They tap Join | Attendee count increases by one, their name appears on the roster, and the chat unlocks | E2E — Sprint 3 |
| US-05 | ⬜ | A student has joined a session with at least one other attendee | They type a message and send | It appears for every attendee within a second, tagged with sender and timestamp | Two-client manual test, then E2E |
| US-05b | ⬜ | A student has **not** joined a session | They query the messages table for it | No rows are returned | Database authorization rule — needs a DB test |
| US-07 | ⬜ | A session has reached capacity | A new student attempts to join | The join is rejected, the button reads "Session full", and the count does not change | Unit test on message mapping |
| **US-07b** | ⬜ | A session has exactly one seat left | **Two students attempt to join at the same moment** | Exactly one succeeds; the other is told the session is full; the roster never exceeds capacity | **DB concurrency test — see below** |
| US-08 | ⬜ | A student has joined a session | They tap Leave | They disappear from the roster and the seat is released | E2E — Sprint 3 |
| US-09 | ⬜ | A host owns an open session | They cancel it | Attendees see a cancellation notice and new joins are rejected | E2E — Sprint 4 |
| US-06 / US-12 | ⬜ | Several sessions exist across courses and campus zones | A student applies a course or zone filter | Only matching sessions remain; clearing the filter restores all | Component test — Sprint 3 |
| US-16 | ⬜ | No sessions exist for a student's course | They open the session list | The empty state invites them to start one or post a request | Component test |
| US-23 | ⬜ | A student is deciding whether to walk across campus | They open a session | They see who is already attending before joining | E2E |
| US-11b | ⬜ | A signed-in student queries another student's profile row | They request the `email` column | The request is denied; name, major, and year are returned | Column-level access control — needs a DB test |

## US-07b is the one to write first

The report called concurrent seat claims the project's most serious risk. We
disagree about the *schedule* impact (see
[ADR 0005](./adr/0005-ci-in-sprint-one.md)) — but the correctness claim still
needs proving, and it is the only acceptance criterion here that cannot be
verified by clicking around.

The test needs two database connections, not two browser tabs:

```sql
-- Connection A                     -- Connection B
begin;                              begin;
<join the session>;                 <join the session>;   -- must block
commit;                             -- unblocks, must fail as "full"
```

The exact call depends on the schema decision (TASK-00). What matters is that
B blocks until A commits, and then fails — rather than reading a stale count
and succeeding.

Write it as soon as there is a schema. The local database and the harness
already exist: `tests/db/harness.test.ts` runs exactly this shape with an
advisory lock standing in for the join, and was checked to fail when the two
connections do not contend. Note what the test does *not* need: a browser, a
running app, or two people clicking. Two connections and a transaction are
enough.

**Why Vitest with two `pg` clients rather than pgTAP.** pgTAP runs each test
file inside a single database session, so one connection cannot block on
another without `dblink` workarounds. US-07b is precisely a two-session test.
Vitest also keeps database tests in the same language and runner as the unit
tests. pgTAP remains a good fit for single-session checks such as RLS policies,
and can be added alongside if the team prefers it there.

**Database tests run in CI** (the `db` job in `ci.yml`), not only locally.

## Coverage, stated plainly

**Zero.** `npm test` covers `src/lib/env.ts` — missing and malformed
configuration — and `npm run test:db` proves the database harness can connect
and make one connection wait on another. Nothing in this table is verified.

That is the correct state before the schema exists — but it means the green CI
badge currently certifies that the code compiles, lints, and reaches a
database, nothing more. Say
that plainly in the report rather than letting "CI passing" do unearned work.
