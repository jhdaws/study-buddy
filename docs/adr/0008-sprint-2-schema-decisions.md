# ADR 0008 — Sprint 2 schema decisions

**Status:** Accepted · **Date:** 2026-09-29
**Supersedes:** the curated campus-building layer of
[ADR 0007](./0007-map-provider.md), and its advice to restrict the server Maps
key by IP; the closed department list of [ADR 0006](./0006-course-model.md)

## Context

Every route and helper in the repository is a stub waiting on the schema, and
four people are about to build on it in parallel (the four tracks in
[`tickets.md`](../tickets.md)). The schema discussion (TASK-00, ticket W0) had
two halves:

- **Product calls**, made by the team on 2026-09-29 and recorded in
  `tickets.md`. Three of them were the agent's reading of what was said, and
  were marked unconfirmed.
- **Technical picks**, recommended during AI-assisted planning and listed in
  `tickets.md` as "To confirm at W0".

Both halves have now been approved, the three readings included. Two of the
product calls reverse parts of accepted ADRs: there is no longer a curated
list of campus buildings (ADR 0007), and departments are no longer a closed
list (ADR 0006). This record writes all of it down in one place and fixes
the shape of the tables W2 creates.

## Decision

### Product rules

| # | Rule | Where it is enforced |
| --- | --- | --- |
| 1 | **A display name is required at first sign-in.** The profile row exists from signup with no name; creating a session requires one. | A4 (name step), S1 (`create_session`) |
| 2 | **Capacity and times are set by the host.** Only sanity checks: end after start, start not in the past at creation, capacity ≥ 2 (the host counts as one). No maximums. | S1 |
| 3 | **The host cannot leave; the host cancels.** Status is `open` or `cancelled`. "Ended" is derived from the end time, never stored. | S1, US-09 |
| 4 | **Chat is writable until one week after the session ends**, then read-only. | Messages ticket (later), in RLS |
| 5 | **Deleted accounts are anonymised.** Messages are kept and shown as "Deleted user"; personal data is removed; the user's upcoming hosted sessions are cancelled. | Foreign keys (below) + US-24 |
| 6 | **Study requests carry a poster-set time range** and expire at its end. | Study requests ticket (later) |
| 7 | **No curated campus building list.** Every location, campus buildings included, comes from Google Places. | M2, M3 |
| 8 | **Departments and courses are learned from use.** A handful of each are seeded; users add the rest, departments included. `merged_into` exists on both. | S2, W3 |

Rule 2 puts "not in the past" in `create_session`, not in a `CHECK`. A
constraint comparing against `now()` is re-evaluated on every update, so
cancelling a session whose start had passed would fail — and restoring a
backup would reject every past session.

### Technical rules

9. **Seats left are derived from the roster**, never stored as a counter. A
   stored count can drift from the roster; a derived one cannot. At our scale
   the join costs nothing.
10. **Authorization lives in RLS, on every table, deny by default.** Server
    checks exist only to produce a good error message. RLS is enabled when a
    table is created, and a table with no policy is unreadable — a missing
    policy fails closed. `tests/db/rls.test.ts` fails if any table in
    `public` lacks RLS.
11. **Joining goes through a database function holding a row lock** (later
    sprint), never a plain client `INSERT`. See `architecture.md` §3.
12. **Location rows are written only by the server**, after it has looked
    the place up with Google Places and checked the radius and place type
    (M3). RLS lets clients read locations, never write them. This brings the
    **Supabase secret key** into the app as a server-only environment
    variable, `SUPABASE_SECRET_KEY` — never `NEXT_PUBLIC_`, and only in a
    module that cannot be imported from client code. It bypasses RLS, so it
    is used for location writes and nothing else.
13. **One `locations` table of Places venues, keyed by `place_id`.** No
    building/venue split and no `kind` discriminator: without a curated
    layer there is only one kind. The table has its own `id`, which sessions
    reference, and `place_id` is unique — Google can reissue a place's ID,
    and a surrogate key means refreshing one is a single-row update.
14. **The session stores a host-editable location label.** Whether Google's
    terms allow caching a place's *name* is **unverified** (M1 checks). The
    default, adopted so nothing depends on the answer: the UI prefills the
    label from Places, the host can edit it, and it is saved on the session
    as the host's own text. `locations` stores only `place_id`, the
    coordinates the server validated, and when it validated them. Google may
    also limit how long coordinates can be cached — **also unverified**, also
    for M1; `validated_at` exists so stale rows can be re-validated.
    Revisit this default once M1 has read the terms.
15. **The server-side Maps key is restricted by API and a daily quota cap,
    not by IP.** Vercel functions have no fixed outbound IP, so an IP
    restriction would either block our own server or have to allow
    everything. The key stays server-side (no `NEXT_PUBLIC_` prefix), is
    limited to the Places API, and has a daily quota cap so a leak costs a
    bounded amount. **Not verified against current Google Cloud or Vercel
    documentation** — M1 checks, including whether a paid Vercel option
    offers a fixed IP.
16. **Email is never copied into `profiles`.** It stays in `auth.users`,
    which clients cannot read. US-25 (email hidden from other users) then
    holds without column-level grants — the mistake an earlier scaffold made
    (see US-25 in `backlog.md`) cannot recur, because the column is absent.

### The tables (W2)

One migration, `supabase/migrations/20260929162814_schema_skeleton.sql`,
structure only. Each track adds its rules — CHECKs, functions, triggers,
policies — in its own later migration.

| Table | Key | Columns |
| --- | --- | --- |
| `profiles` | `id` → `auth.users` | `display_name` (null until the name step), `created_at` |
| `departments` | `code` (normalised, e.g. `CS`) | `name` (nullable), `merged_into` → `departments`, `created_by` → `profiles`, `created_at` |
| `courses` | `id`; unique (`department_code`, `number`) | `department_code` → `departments`, `number`, `title` (nullable), `merged_into` → `courses`, `created_by` → `profiles`, `created_at` |
| `locations` | `id`; unique `place_id` | `lat`, `lng`, `validated_at` |
| `sessions` | `id` | `host_id` → `profiles`, `course_id`, `location_id`, `location_label`, `room` (nullable), `topic`, `starts_at`, `ends_at`, `capacity`, `status` (`session_status` enum: `open`, `cancelled`), `created_at` |
| `session_attendees` | (`session_id`, `user_id`) | `joined_at` |

Every timestamp is `timestamptz`. Department `name` is nullable for the
reason ADR 0006 gave for course titles: a student adding a department may
not know the official name, and empty beats wrong. `room` is nullable because
it means something in a building and nothing in a café.

### What happens on delete (rule 5)

Deleting an account deletes the `auth.users` row. Everything else follows
from the foreign keys:

| Foreign key | On delete | Why |
| --- | --- | --- |
| `profiles.id` → `auth.users` | **cascade** | The profile *is* the personal data. It goes with the account. |
| `sessions.host_id` → `profiles` | **set null** | The session is shared history: other attendees were there, and its chat is theirs too. It stays; the host shows as "Deleted user". This makes `host_id` nullable — `create_session` always sets it, so it is null only after a deletion. |
| `session_attendees.user_id` → `profiles` | **cascade** | Roster rows are personal and nothing else hangs off them. Deleting them frees the seats. |
| `session_attendees.session_id` → `sessions` | **cascade** | A roster has no meaning without its session. Sessions are cancelled, not deleted, so this rarely fires. |
| `courses.created_by`, `departments.created_by` → `profiles` | **set null** | The course or department is everyone's; only the attribution is personal. |
| `sessions.course_id` → `courses`, `sessions.location_id` → `locations` | **restrict** | A course or location that sessions use cannot vanish from under them. Duplicates are merged, not deleted. |
| `courses.merged_into`, `departments.merged_into` | **restrict** | Deleting a merge target would silently un-merge its duplicates. |
| `courses.department_code` → `departments` | **restrict**, on update **cascade** | Departments are merged, not deleted. The code is a natural key, so if one ever has to be corrected, its courses follow it. |

For the later tables, decided now so they are built this way:

- **`messages.author_id` → set null.** The message is kept and shown as
  "Deleted user" — rule 5 as the team stated it.
- **`study_requests.poster_id` → cascade.** A request is one person's, not a
  shared record, and it expires anyway.

**The foreign keys cannot cancel sessions.** Deleting a host nulls
`host_id` on their upcoming sessions and leaves them `open`, with nobody
running them. US-24's deletion flow must, in one transaction, cancel the
user's hosted sessions that have not ended **before** deleting the auth user.
It must also be a hard delete: a soft-deleted auth user keeps its row, so
none of the cascades above fire.

## Consequences

**Good.** Four tracks can build on one agreed set of tables. Every rule has
one named owner and one place it is enforced. Access fails closed until a
track opens it deliberately. No curated data to gather or keep accurate.
Deleting an account is mostly the database's job, not application code.

**Bad: duplicates are now likely, not just possible.** With departments open,
`CS`, `C.S.`, and `COMPSCI` can all be created. Normalisation catches the
punctuation; nothing catches the synonym. Usage ranking floats the real one,
and `merged_into` lets someone collapse the rest later without a migration.
The team accepted this risk. Do not build a merge UI until the data actually
degrades.

**Bad: campus buildings depend on Google.** Whether Places returns
Featheringill and Stevenson with usable place types is unverified; M2 checks.
Names come from Google, not from what students call a building — the editable
label is the escape hatch. The campus-zone filter (US-12) has no data to
filter on and needs rethinking.

**Bad: the secret key is now in the app.** It bypasses RLS entirely. It
belongs in exactly one server-only module, used for location writes. If it
ever reaches a client bundle, every table is open.

**Bad: `sessions.host_id` is nullable.** Code reading a session must handle
a missing host. RLS policies comparing `host_id` to the caller never match a
null, so an orphaned session cannot be edited — which is correct.

**Watch: grants are Supabase's defaults.** On the local stack, `anon` and
`authenticated` hold every table privilege on the new tables; RLS is what
restricts them. "No client writes" means
"no write policy", not "no grant".

**Watch: views bypass RLS** unless created `with (security_invoker = true)`.
A plain view for seats left would expose every session and roster to any
client. The RLS guard test does not check views.

## Rejected

- **A stored seat counter.** Faster to read and certain to drift.
- **Authorization in server code, RLS as a backstop.** The browser reads
  Supabase directly for realtime, so server checks cannot be the control.
  Doing both halfway is the bad outcome.
- **A plain `INSERT` for joining**, guarded by a client-side capacity check.
  It is the read-then-write race of `architecture.md` §3.
- **Clients writing location rows**, with RLS checking the radius. RLS cannot
  call Google, so a client could pair a real `place_id` with coordinates of
  its own choosing.
- **A database function calling Google** (via an HTTP extension). It puts the
  Maps key in the database and makes a network call inside a transaction.
- **Buildings and venues as separate tables**, or one table with a `kind`
  column. Both existed to separate curated buildings from Google venues;
  without the curated layer there is nothing to separate.
- **Storing the place's name on `locations`.** Possibly not allowed, and M1
  has not checked yet. The session label covers the need either way.
- **`on delete cascade` from host to session.** Deleting one account would
  erase other people's sessions and chat.
- **`on delete restrict` from host to session**, making account deletion
  reassign sessions to a placeholder "deleted user" profile first. A
  sentinel row that every query has to know about, for no gain over a null.
- **Restricting the server Maps key by IP** (ADR 0007). See rule 15.
- **Email in `profiles` with column grants hiding it.** Works, but it is the
  fix for a problem that does not arise if the column is not there.

## Still open

- **Google's caching terms** for place names and coordinates (rule 14) — M1.
- **Key restrictions** for the server Maps key (rule 15), checked against
  current Google Cloud and Vercel documentation — M1.
- **Whether Places surfaces campus buildings well** with the place types we
  allow, and which types exclude residences — M2.
- **Course-number format** (four digits, letter suffix?) — W3 checks, S2
  encodes.
- **Campus-zone filtering (US-12)** without a building list — later sprint.
- **ADRs 0001–0003 are still Proposed.** This record does not ratify them.
