# AI usage log

Syllabus compliance record for CS 4278, Group 4. Columns match Part B of the
Requirements Analysis Report so entries can be lifted straight into future
deliverables.

**This file is the canonical log.** The three entries from the report's Part B
are carried over below so there is one place to look, not two.

## How to add an entry

1. Log it **when it happens**, not the night before a deliverable. Reconstructing
   what you prompted three weeks ago produces a log that is technically complete
   and actually useless.
2. Fill in every column except **Verified by**.
3. Leave **Verified by** as `⬜ pending` until a human has actually read the
   output and formed a judgement about it. Putting your name there means *you
   checked this*, not *you saw it go past*.
4. Be specific in "What we changed / rejected". "Kept it" is not an entry — it
   is the absence of one. Say what you altered and why, or say you accepted it
   unchanged and why that was reasonable.

Template:

```
| YYYY-MM-DD | Tool | Where used | Prompt (summarized) | What the AI produced | What we changed / rejected, and why | ⬜ pending |
```

---

## Log

| Date | Tool | Where used | Prompt (summarized) | What the AI produced | What we changed / rejected, and why | Verified by |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-16 | Gemini | Requirements Analysis Report — entire document | Set up and refine the Project Part 1 report from the assignment rubric, course ICAs, and Brightspace dates | Initial document draft, user-story backlog structure, milestone breakdown, test-case scaffolding | Trimmed narrative paragraphs; removed numbering; removed redundant team list; updated milestones to the 5-sprint schedule and exams; grounded scope to Vanderbilt; cleared tables for manual formulation | Jack Dawson |
| 2026-09-16 | Gemini | Requirements report — user stories | Estimate effort in hours for these user stories given our experience | Hour estimates and supporting reasoning | Accepted most estimates since the team had no strong prior sense of effort; changed the ones that seemed unrealistic | Jack Dawson |
| 2026-09-16 | Claude Opus 5 | Requirements report — Section 6, project plan and milestones | Format a milestone table incorporating Brightspace due dates (screenshots attached); add interim dates to keep the team on track between assignments | Milestone table with primary and secondary due dates, plus suggestions for each milestone | Kept the suggested logistical tasks (GitHub repo setup, CI/CD workflows) and the added product-market-fit, interview, and platform-testing requirements — they seemed useful regardless of project direction | Nate Dalbert |
| 2026-09-17 | Claude Opus 5 | Review of the Requirements Analysis Report | Review this report and give thoughts before setting up the repo | A critique identifying: the stack declared as unresolved "or" choices; three incompatible auth plans (magic link / Supabase+Redis / Okta); two reference-data sources with no owner (buildings, course catalog); missing safety, mobile, cold-start, and sign-out stories; Part A/Part C story-ID mismatch; CI listed twice and Sprint 3 overloaded before Fall Break; and an argument that the "last seat" race was not the real schedule risk | Not yet acted on in the report itself — **the report has not been revised**. The repo was built against the critique's conclusions. See "Open follow-ups" below. | ⬜ pending |
| 2026-09-17 | Claude Opus 5 | `docs/adr/0001`–`0005` | Recommend one stack and record the reasoning | Five architecture decision records: single Next.js + Supabase stack, seeded reference data, magic-link auth, mobile-first, CI in Sprint 1 with a corrected risk register | Decisions accepted as the basis for the scaffold. **The team has not yet ratified ADR 0001** — it overrides the report's stated stack and drops Moses's preferred FastAPI backend, which is a team call, not an AI call. | ⬜ pending |
| 2026-09-17 | Claude Opus 5 | Repository scaffold | Set up the repo on the recommended stack | Next.js 16 + TypeScript + Tailwind app; Supabase schema with RLS on all seven tables; `join_session()` with row-level locking; magic-link auth flow; session browse/create/detail with Leaflet map, live roster, and live chat; GitHub Actions CI | Not yet reviewed by the team. Lint, typecheck, 15 unit tests, and the production build all pass. | ⬜ pending |
| 2026-09-17 | Claude Opus 5 | `data/buildings.json`, `data/courses.json` | Seed reference data for buildings and courses | 16 Vanderbilt buildings with coordinates; 24 course codes with titles | ⚠️ **Coordinates are AI-generated and unverified.** Every row carries `"verified": false` for this reason — they are plausible, not checked. Course list is a partial hand-seed, not a catalog integration. Verifying both is TASK-01 and TASK-02. | ⬜ pending |
| 2026-09-17 | Claude Opus 5 | `docs/backlog.md` | Correct the backlog found in review | Unified `US-nn` IDs; promoted US-16 to P0; moved US-18 from the undefined "P4" to P2; re-estimated US-05 from 16h to 30h; rescoped US-19 from Google Calendar OAuth to `.ics`; added US-21–US-25 and TASK-01–TASK-05 | Re-prioritization and re-estimation are **proposals**. US-05's 30h figure in particular is an AI guess that should be checked against reality after Sprint 2. | ⬜ pending |
| 2026-09-17 | Claude Opus 5 | `supabase/migrations/0001_init.sql` | (Unprompted) audit of the RLS policies it had just written | Found that row-level security is row-level, not column-level, so a readable `profiles` table exposed every student's email address to every other student; added column-level grants excluding `email` | Accepted. Logged because it is a self-identified defect in AI-written code — the same review pass that found it also wrote it, which is not independent verification. Logged as US-25. | ⬜ pending |
| 2026-09-17 | Claude Opus 5 | `src/lib/*.test.ts` | Write unit tests for the scaffold | 15 Vitest tests covering email-domain validation, session-form validation, and database-error mapping | Accepted, with a stated limit: these cover input validation and error *reporting* only. The RLS, realtime, and seat-race guarantees are **unproven** pending a live database (TASK-03). `docs/test-cases.md` records this. | ⬜ pending |
| 2026-09-21 | Claude Opus 5 | Whole repository | Strip the scaffolding back to files and folders only; remove the database work entirely so the schema can be specified first | Removed both migrations, the seed script, the reference-data JSON, the generated types, and all 15 unit tests. Reduced every route, component, and helper to a stub carrying a comment describing what belongs in it. Reset the status columns in `backlog.md` and `test-cases.md`, marked ADRs 0001–0003 as Proposed rather than Accepted, and added TASK-00 for the schema decision. | Team decision, carried out as asked. Worth recording that the deleted code was AI-written and never human-reviewed, so nothing verified was lost — the ADRs retain the reasoning. | ⬜ pending |
| 2026-09-21 | Claude Opus 5 | `docs/adr/0006-course-model.md` and related docs | Document the agreed course model: department and course number entered separately, catalog grown from use | ADR 0006 with a schema sketch, normalization and validation rules, and suggestion ranking; marked ADR 0002's course half superseded; retargeted TASK-02 from "build the course catalog" to "compile the department list" | Team decided the department/number split; the AI supplied the typo-propagation mitigations (usage ranking, inline session counts, `merged_into` column) and the normalization rules. Those mitigations are unproven guesses about how the data will degrade — revisit after real usage. | ⬜ pending |
| 2026-09-21 | Claude Opus 5 | `docs/adr/0007-map-provider.md` and related docs | Compare Google Maps, ArcGIS, and OpenStreetMap for location data; document the Google decision | Comparison of the three providers including billing, caching terms, and the ArcGIS-vs-campus-GIS distinction; ADR 0007; updated stubs, env example, and backlog tasks | Team chose Google Maps after the AI had initially recommended OpenStreetMap — the AI's recommendation had optimised for avoiding a billing account, which the team does not consider a constraint. Kept the AI's `locationRestriction`-vs-`locationBias` point, the server-side re-validation requirement, and the API-key restriction warnings. Pricing and free-tier claims are **not verified** — terms changed in 2025 and must be checked directly (TASK-06). | ⬜ pending |
| 2026-09-28 | Claude Code | `docs/architecture.md`, `docs/tickets.md`, `HANDOFF.md` | Write up the architecture with diagrams; break the user stories into tickets small enough to split across four people; add a session handoff log | Architecture doc with five Mermaid diagrams (container, three class models, concurrent-join sequence) and a "what this is bad at" section; 27 tickets across five tracks plus a schema-decision meeting (C0); `HANDOFF.md` with an entry template, linked from `CLAUDE.md` | The class models in §2 are a **proposal** for the C0 meeting, not an agreed schema. Ticket sizes are guesses with no velocity behind them. Diagrams were rendered with `mmdc` to confirm they parse; nothing else was checked. | ⬜ pending |

---

## Open follow-ups

Things the log above implies but that are not yet done:

- [ ] **Team ratifies or overrules ADRs 0001–0003.** The repo is scaffolded against a stack that differs from the one in the submitted report. Whichever way it goes, the report's technical section needs revising to match.
- [ ] **Revise the report's risk section** per ADR 0005, or decide deliberately to keep the original framing.
- [ ] **TASK-00: agree the database schema** before any of the stubs get filled in. Courses are settled (ADR 0006); locations are not.
- [ ] **Verify Google Maps pricing and free-tier limits directly** before relying on them (TASK-06). Nothing in this repo's cost claims has been checked against Google's current terms.
- [ ] **Someone reviews the stubs.** Every row from 2026-09-17 onward is `⬜ pending`. A green CI badge is not a human having read the code — and right now it certifies only that the code compiles.

## Two notes on honesty

**A "Verified by" name is a claim.** For this project it means: a human read the
output, understood it, and would defend it if Dr. Singh asked why it is there.
It does not mean the tests passed, and it does not mean the AI sounded
confident. Several rows above are AI-written *and* AI-reviewed, which is not
verification at all — it is the same judgement applied twice.

**Name spelling.** The report's team table lists *Nate Dalbert*; Part B's
verification column lists *Nate D'Albert*. This log uses the team-table
spelling. Worth fixing in the report before resubmission — a graded document
that spells an author's name two ways invites the reader to check other details.
