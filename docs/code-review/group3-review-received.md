# Code review received -- Group 3 reviewing Group 4   (docs/code-review/group3-review-received.md)

Sprint 4 Part 1 ("as the author team"). Pull request reviewed:
[#85](https://github.com/jhdaws/study-buddy/pull/85), "US-23: live roster -- the session page
updates while you watch". Reviewers: `tevinpark`, `JKong05`, `davidyesunglee`, all on 2026-11-11.

## Summary of the review

Group 3 found **no blocking issues**. Following the brief, they said what they checked instead
of inventing one: correctness of the join, leave and reconnect paths; security of what Realtime
sends (the read policy, the anon revoke, DELETE payloads); the tests at every level; design; and
performance. They noted they read the code but did not run the app. Seven inline comments: two
praise, five suggestions.

## Dispositions

Each is also posted as a reply on #85.

| # | Reviewer | Where | Comment | Disposition |
|---|----------|-------|---------|-------------|
| 1 | davidyesunglee | `src/lib/live-roster.ts:65` | `channel()` returns an existing channel with the same topic and `removeChannel()` is async, so a quick remount gets the old, closing channel back and the roster silently stops updating. Use a unique topic. | **Accepted -- fixed** in the Sprint 4 cleanup PR: each subscription's topic is `roster:<session>:<uuid>`. Test: "gives each subscription its own topic, even for the same session". |
| 2 | davidyesunglee | `supabase/migrations/20261026022048_live_roster.sql:54` | Realtime skips RLS on DELETE events, so every signed-in student gets every leave. Harmless only while the read policy is `using (true)`; add a test that fails if it is tightened. | **Accepted -- fixed** in the Sprint 4 cleanup PR: `tests/db/live-roster.test.ts`, "keeps the roster readable by every signed-in student while it is published". |
| 3 | JKong05 | `src/components/SessionRoster.tsx:108` | The "N of M going" live region has no `aria-atomic`, so a screen reader may announce only "2". | **Accepted -- fixed** in the Sprint 4 cleanup PR: `aria-atomic="true"`, with a component test. |
| 4 | tevinpark | `src/lib/live-roster.ts:97` | `.catch(() => undefined)` silently ignores a failed `setAuth()`. | **Accepted -- fixed** in the Sprint 4 cleanup PR: logged as `console.warn`, with the error's name only (the object could carry the token). Subscribing anyway is kept: Realtime refuses it, as before. |
| 5 | tevinpark | `tests/db/live-roster.test.ts:67` | Test that signed-out users actually receive no DELETE events, end to end through Realtime, not just the grants. | **Accepted -- deferred** to [#142](https://github.com/jhdaws/study-buddy/issues/142): it needs the Realtime server in the db test setup, which today only starts Postgres. The grant test plus #2 cover the two conditions the leak depends on. |
| 6 | tevinpark | `src/components/SessionRoster.tsx:85` | Praise: `router.refresh()` instead of applying payloads keeps the database the source of truth. | Thanked. |
| 7 | JKong05 | `src/lib/live-roster.ts:8` | Praise: the subscription only signals; the page re-fetches. | Thanked. |

## What we changed in how we work

Fixes 1 and 3 were problems our own tests could not catch: our tests checked that the feature
worked, not what happens when a component remounts quickly or what a screen reader hears.
Every pull request should now add at least one failure-path or accessibility check, not only the
happy path (`CLAUDE.md`, "Before you open a PR").
