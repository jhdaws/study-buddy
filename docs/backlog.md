# Product backlog

Corrected from the Requirements Analysis Report (Sept 16, 2026). **Story IDs
here are canonical** — use `US-nn` in commit messages, branch names, GitHub
issues, and test names so the report, the tracker, and the code all agree.

## What changed from the report, and why

| Change | Reason |
| --- | --- |
| IDs unified as `US-01`…`US-nn` | Part A numbered stories 1–20; Part C used a different `US-` scheme where US-03 and US-07 were both "create a session" and US-10/US-11 had no backing story. Traceability was broken. |
| US-16 promoted P1 → **P0** | It is the answer to the empty-map cold start. Without it, launch day is a blank screen and the Sprint 3 user test produces no signal. |
| US-18 priority `P4` → **P2** | P4 was never a defined tier — the report defines P0–P3 only. Safety reporting belongs in the release. |
| US-19 rescoped: Google Calendar → **`.ics` download** | OAuth consent verification is slow and fragile. An `.ics` file is ~1 hour, works with Google, Apple, and Outlook, and needs no third-party approval. |
| US-05 estimate 16h → **30h** | The original figure omitted persistence, authorization, reconnection, and attribution. |
| Added US-21…US-24 | Gaps found in review: no sign-out, no blocking, no pre-arrival safety context, no account deletion. |
| Added TASK-01…TASK-05 | Work the report assumed into existence with no owner or estimate. |

## Priorities

- **P0** — Essential MVP core. Without all of these there is no product.
- **P1** — High-priority release target.
- **P2** — Medium-priority feature.
- **P3** — Stretch polish.

## Stories

Status: ⬜ not started · 🚧 in progress · ✅ done

**Everything is ⬜.** An earlier scaffold implemented several of these; it was
deliberately stripped back so the first push is structure only and the schema
can be designed properly. Nothing below is built.

| ID | Pri | Status | Story | Est |
| --- | --- | --- | --- | --- |
| US-01 | P0 | ⬜ | As a Vanderbilt student, I want to authenticate with my Vanderbilt email, so that everyone on the platform is a verified classmate. | 12 |
| US-02 | P0 | ⬜ | As an authenticated user, I want to create a study session with course, topic, building, room, time range, and max capacity, so that peers can join me. | 14 |
| US-03 | P0 | ⬜ | As a student looking for peers, I want to see active sessions on a campus map or list, so that I can find groups meeting near me. | 16 |
| US-04 | P0 | ⬜ | As a student, I want to join an open session in one tap, so that my name appears on the roster and my seat is reserved. | 8 |
| US-05 | P0 | ⬜ | As a participant, I want to send and receive messages in a session chat, so that I can coordinate with the group. | ~~16~~ **30** |
| US-16 | **P0** | ⬜ | As a student who can't find a session for my course, I want to post a study request visible to classmates, so that they can see the interest and start one. | 5 |
| US-06 | P1 | ⬜ | As a student preparing for a class, I want to filter sessions by course code. | 10 |
| US-07 | P1 | ⬜ | As a student browsing, I want full sessions to show "Session full" and block new joins. | 5 |
| US-08 | P1 | ⬜ | As an attendee, I want to leave a session, so that my seat opens up for someone else. | 4 |
| US-09 | P1 | ⬜ | As a host, I want to edit or cancel my session, so that attendees always see the correct time and place. | 9 |
| US-11 | P1 | ⬜ | As a new user, I want to fill in my academic profile (major, minor, year, current courses), so that others have context before joining. | 6 |
| US-12 | P1 | ⬜ | As a student searching, I want to filter by building or campus zone. | 7 |
| US-10 | P2 | ⬜ | As a student who joined a session, I want a reminder 30 minutes before it starts. | 8 |
| US-13 | P2 | ⬜ | As a host, I want to remove a disruptive attendee. | 11 |
| US-14 | P2 | ⬜ | As a student who just finished a session, I want to rate the session and host. | 8 |
| US-18 | **P2** | ⬜ | As a student, I want to report an inappropriate user or message. | 6 |
| US-15 | P3 | ⬜ | As a returning user, I want to see past sessions I've attended, so I can rejoin groups that worked well. | 5 |
| US-17 | P3 | ⬜ | As a student enrolled in a course, I want a notification when a session is created for it. | 7 |
| US-19 | P3 | ⬜ | As an attendee, I want to download a `.ics` file for a session, so it lands in whatever calendar I use. | ~~6~~ **1** |
| US-20 | P3 | ⬜ | As a host, I want to repeat a session weekly. | 4 |

### Added in review

| ID | Pri | Status | Story | Est |
| --- | --- | --- | --- | --- |
| US-21 | P1 | ⬜ | As a signed-in student, I want to sign out, so that I can leave my account on a shared or borrowed device. *(Missing entirely from the report.)* | 2 |
| US-22 | P2 | ⬜ | As a student, I want to block another user, so that I never see or get joined by someone who made me uncomfortable. | 8 |
| US-23 | P1 | ⬜ | As a student deciding whether to walk somewhere, I want to see who is already attending before I commit. *(Should be visible from the list view, not only the session page.)* | 4 |
| US-24 | P2 | ⬜ | As a student, I want to delete my account and my data. | 5 |
| US-25 | P1 | ⬜ | As a student, I want my email address hidden from other users, so that joining a session does not hand out my contact details. *(The report's Part C assumed a tiered-visibility profile that has no story behind it — this is the minimum honest version. Note that row-level access rules do not restrict columns; hiding a field takes a separate mechanism.)* | 3 |

**A note on safety.** US-18, US-22, and US-23 are not polish. This product's
entire premise is sending students to meet people they do not know in physical
rooms. The report's only related item was US-18, parked at an undefined "P4".
Treat these three as a group and land them before any public launch.

## Tasks (not user-facing, but real work)

| ID | Owner | Status | Task |
| --- | --- | --- | --- |
| TASK-00 | — | 🚧 | **Agree the database schema** — tables, relationships, where capacity is enforced, how concurrent joins stay correct, and where authorization lives. Blocks everything else. *Product calls decided 2026-09-29; technical picks await team review — see W0 in `tickets.md`.* |
| TASK-01 | — | Dropped | ~~Curate the core Vanderbilt academic buildings with verified coordinates.~~ *Dropped 2026-09-29: every location, campus buildings included, comes from Google Places. Recorded in ADR 0008 once written.* |
| TASK-06 | — | ⬜ | Create the Google Cloud project, enable Maps/Places, set up billing, and **restrict both API keys** (browser key by HTTP referrer, server key by IP) before either is committed anywhere. |
| TASK-07 | — | Dropped | ~~Ask VU Facilities/IT whether Vanderbilt publishes campus GIS building data.~~ *Dropped with TASK-01 — it only fed the curated building layer.* |
| TASK-02 | — | ⬜ | ~~Compile the full department list (~100–150 rows, closed set).~~ **Reduced 2026-09-29:** seed ~10 departments and a few courses; users add the rest, departments included. See W3. |
| TASK-03 | — | 🚧 | Create the Supabase project, apply migrations, and add env vars to Vercel. *Hosted project created; local database and test harness landed (#4). Vercel env vars and migrations outstanding.* |
| TASK-04 | — | ⬜ | Keyboard and screen-reader pass over the core flows. |
| TASK-05 | — | ⬜ | Generate TypeScript types from the schema once TASK-03 is done, rather than hand-maintaining them. |

## Estimate sanity check

P0 stories total **85 hours** after re-estimating US-05 and promoting US-16.
Team capacity is roughly 4 people × 7 h/week × 12 weeks ≈ **336 hours** — but
that budget also has to absorb report writing, demos, meetings, and learning
whatever the database decision commits us to. The P0 block is comfortable; P1 is achievable; P2 and P3
are genuinely optional and should be traded away without drama if a sprint
slips.
