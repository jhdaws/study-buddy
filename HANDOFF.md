# Handoff log

Context that does not live in the code, the commits, or the docs — written by
each AI session at the end of its run, read by the next one at the start.

**If you are an agent starting a session: read the top entry before doing
anything else.** It tells you what is uncommitted, what was decided but not yet
written down, and what the last session got wrong.

**If you are an agent ending a session: add a new entry at the top**, above the
existing ones. Do not edit older entries — they are a record of what was
believed at the time, and rewriting them destroys the thing that makes this
file useful.

## What belongs here, and what does not

This file is for state that would otherwise be lost between sessions. It is
deliberately *not* a second copy of the documentation.

| Goes here | Goes somewhere else |
| --- | --- |
| Uncommitted work and which branch it sits on | — |
| A decision made in conversation but not yet in an ADR | `docs/adr/` once written up |
| Questions asked of the user that were never answered | — |
| A known-wrong or stale statement in the docs | Fix the doc; note the fix here |
| Something tried that failed, and why | — |
| A constraint the user stated verbally | `CLAUDE.md` if it is a standing rule |
| Task status | `docs/tickets.md` and `docs/backlog.md` |
| Why a design is the way it is | `docs/adr/` |
| What a file should contain | The stub comment in that file |

If a fact has a permanent home, put it in its permanent home and mention the
move here. An entry that just restates the backlog is noise.

## Entry template

Copy this, fill it in, delete any section that is genuinely empty rather than
writing "none".

```markdown
## YYYY-MM-DD · <one-line summary of the session>

**Branch:** <branch> · **Commits made:** <shas, or "none">

### What changed
- <file or area> — <what and why, one line each>

### Uncommitted at end of session
- <path> — <what it is, and whether it is ready to commit>

### Decided in conversation, not yet written down
- <decision> — <where it should eventually live>

### Open questions for the user
- <question, and what is blocked until it is answered>

### Things the next agent should be careful about
- <traps, stale docs, environment quirks, failed approaches>
```

### Two rules for writing an entry

**Do not claim more than you verified.** If a diagram was rendered, say so. If
a schema was written but never applied to a real database, say that too. This
file is read by someone with no way to check your work, which is exactly the
situation where overclaiming does the most damage.

**Record the failures.** The most valuable line in most entries is the one
saying an approach was tried and did not work. Without it the next session
spends its first hour rediscovering the same dead end.

---

## 2026-09-28 · Opened PRs for the docs; refined the tickets

**Branch:** `db-setup` → `docs-refine-tickets` · **Commits made:** `b36fe7b`
(on `db-setup`), `d71c570` and this entry (on `docs-refine-tickets`)

### What changed
- **PR #1** (`db-setup` → `main`) — the previous session's uncommitted docs,
  plus an AI-usage-log row for them. Docs only; despite the branch name, no
  database work is in it.
- **PR #2** (`docs-refine-tickets` → `db-setup`, stacked) — ticket refinement;
  the PR body lists every change. Headline: US-16 had no tickets, and nothing
  set up a local database for the US-07b test.
- `CLAUDE.md` — removed the claim that CI runs a seed-freshness check. It does
  not; adding one is now on T-C6.

### Answered this session
- **Open question 1 from the entry below is answered for this session:** the
  user asked for the PRs, so the agent committed and pushed. Do not generalise
  that to future sessions without asking.

### Open questions for the user
- Questions 2 and 3 from the entry below are still unanswered.
- **Merge order.** PR #2 is based on `db-setup`. If #1 is squash-merged, #2
  will need rebasing onto `main`; if `db-setup` is deleted on merge GitHub
  retargets #2 automatically (branch auto-delete is currently off).

### Verified versus assumed
- **Verified:** `npm run lint && npm run typecheck && npm test && npm run build`
  passed locally before PR #1. The new tickets dependency diagram was rendered
  with `mmdc` and inspected.
- **Assumed:** every new ticket, dependency, and size in PR #2 is a proposal.
  CI had not reported on either PR when this entry was written.

### Things the next agent should be careful about
- **ADR 0005 is stale in two places** and was deliberately not edited (it is
  an Accepted record): it cites `supabase/migrations/0002_join_session.sql` as
  written, which was deleted in the 2026-09-21 strip-back, and it lists a
  seed-freshness check CI does not run. Supersede or amend it via a new ADR
  rather than rewriting it silently.

---

## 2026-09-28 · Architecture write-up and sprint tickets

**Branch:** `db-setup` · **Commits made:** none — everything below is
uncommitted

### What changed

- **`docs/architecture.md`** (new) — five sections covering the shape of the
  system, proposed class models, the concurrent-join sequence, and a section on
  what this architecture is bad at. Contains five Mermaid diagrams.
- **`docs/tickets.md`** (new) — 27 tickets across five tracks, plus a
  schema-decision meeting (C0). Written because the user said the user stories
  in `docs/backlog.md` were "a bit broad" to split across four people.

### Uncommitted at end of session

- `docs/architecture.md` — ready to commit
- `docs/tickets.md` — ready to commit

Both are documentation only; nothing in `src/` or `supabase/` changed this
session. The user has been doing the pushing themselves, so **do not commit
these without asking.**

### Verified versus assumed

- **Verified:** every Mermaid diagram in both files was rendered with
  `mmdc` (`@mermaid-js/mermaid-cli`) and parses. The container diagram in
  `architecture.md` was rendered to PNG and visually inspected after a first
  version came out with tangled edge routing — the fix was `direction LR`
  inside each subgraph.
- **Assumed:** everything in `architecture.md` §2 (the class models). These are
  a *proposal*, marked as such with a banner at the top of the section. The
  team has not agreed to them. The C0 meeting in `docs/tickets.md` exists
  specifically to accept, change, or reject them.
- **Not checked:** ticket size estimates (S/M/L) are guesses with no
  historical velocity behind them.

### Decided in conversation, not yet written down

Nothing outstanding — the course model and map provider decisions from earlier
sessions were both written up as ADR 0006 and ADR 0007 before this session
started.

### Open questions for the user

None of these block work, but all three have been asked and not answered:

1. **Does the next agent commit, or does the user push?** Every session so far
   has left changes uncommitted for the user to review and push. Assume that
   still holds unless told otherwise.
2. **Should `LocationPicker.tsx` stay a separate component,** or be folded into
   `CreateSessionForm`? The stub was invented by an AI session, not asked for.
   `T-D6` currently assumes it stays separate.
3. **Should `architecture.md` §3 keep the passage disputing the report's risk
   framing?** If the team decided to keep the report's original framing, that
   passage should be cut rather than left as a quiet contradiction.

### Things the next agent should be careful about

- **`main` branch protections are not applied yet.** The user was given
  instructions; `T-A4` tracks it. Do not assume a PR is required or that CI
  gates anything on `main` right now.
- **Secret scanning and push protection are not enabled yet** — and `T-A2`
  creates real Google Maps API keys. If those tickets land in the wrong order
  there is no safety net for a committed key. Flag this if it comes up.
- **The repo lives in `~/Desktop`,** which appears to be synced by
  iCloud. A duplicate git ref (`.git/refs/heads/main 2`, with a literal space)
  appeared once and broke `git fetch` with `fatal: bad object`. It was verified
  to point at an already-merged commit before deletion. **This can recur** — if
  git starts failing on a "bad object" for a ref you do not recognise, check
  `.git/refs/heads/` for space-suffixed duplicates, and confirm with
  `git merge-base --is-ancestor` that nothing unique is in them *before*
  deleting.
- **Every status in every doc is `⬜`, and `docs/test-cases.md` states coverage
  as "Zero".** That is accurate, not an oversight. Do not tidy it into looking
  more finished than it is.
- **RLS is row-level, not column-level.** An earlier session wrote a `profiles`
  policy that correctly restricted rows while exposing every student's email
  address to every other student. The fix is a column-scoped `GRANT`. This is
  logged as US-25 and is an acceptance criterion on `T-C1`. It is an easy
  mistake to make twice.
- `src/lib/harness.test.ts` is a placeholder proving only that the runner
  works. Delete it when the first real test lands.
