# AI vs human review on one PR -- Group 4   (Sprint 4 Part 2 comparison)
PR: `refactor` → `main` of the legacy pricing module (ICA 14): 7 refactoring commits, `legacy_pricing.py` only, +77 / −48 lines · AI reviewer used: LLM + diff (Claude Opus 5.5 in Claude Code, given `git diff main..refactor`) · Prompt (if LLM):

> You are reviewing a pull request that refactors `legacy_pricing.calc`. The refactor must not change behavior or the public signature `calc(t, q, u, d, c=None, w=False)`. Review the diff below. List (1) every behavior change, including inputs the 24 tests do not cover, (2) blocking issues, (3) suggestions, (4) one thing done well. Name the function each comment is about.

The human review is ours: we read the diff before committing each step, ran `pytest -q`, and compared the new `calc()` with the baseline from `main` on 68,040 input combinations after every step (0 differences). Every AI claim below about old vs new behavior was checked by running both versions.

| Finding | Found by human? | Found by AI? | AI comment correct? | Our disposition |
|---------|-----------------|--------------|---------------------|-----------------|
| `base_price`: an unhashable `t` (e.g. a list) now raises `TypeError` instead of `ValueError("bad type")`, because the check became a dict lookup | Yes | Yes | Correct (reproduced: `calc(["concert"], 2, None, 1)`) | Accepted risk: no caller passes non-strings |
| An AI-written comment in an early draft of `coupon_multiplier` said FREEDRINK's perk was "handled elsewhere", which is false | Yes, reading the step-5 diff before committing | No: it was fixed before the reviewed diff | n/a | Accepted, fixed before commit `7e02dba` |
| 24 tests don't cover unvalidated `d`, the "bad type"-before-"bad qty" order, or float money, so a refactor could change them unnoticed | Yes: this is why we added the equivalence check | Partly: it listed the untested inputs but only suggested writing more tests | Correct but incomplete | Accepted, covered by the 68,040-case equivalence check |
| The new helpers (`service_fee`, `role_multiplier`, ...) have no direct unit tests; we only spot-checked `service_fee` band edges by hand | No | Yes | Correct | Accepted, deferred: add tests such as `service_fee(99.99) == 2.5` |
| The helpers are public module-level names, so other code may start calling them and they become part of the API | No | Yes | Correct | Accepted, deferred: add `__all__ = ["calc"]` or prefix with `_` |
| `role_multiplier` still has bare multipliers (0.8, 0.9, 0.85, 0.95), and "lecture"/"workshop" are repeated string literals | No: we chose plain `if`s over a table of conditions | Yes | Correct, low value | Declined: a table of conditions (`verified`, `years >= 10`) reads worse than the `if`s |
| Waitlist $2 is added before the fee band is picked, so it can cost $3.50 | Yes (in our understanding notes) | Yes, from the new order comment in `calc` | Correct, but a pre-existing bug pinned by `test_waitlist_fee` | Accepted, deferred as a separate product decision, not a refactor change |
| The `max(total, 0.0)` clamp can never run, so remove it | Yes: we proved it unreachable by brute force | Yes | Half right: it is unreachable, but deleting it leaves a trap for a cheaper event type | Declined: kept as a documented guard |
| `service_fee(nan)` now returns 5.0 where the old code charged 0.0, flagged as a behavior change | No | Yes | Wrong as a `calc` bug: `calc` returns `nan` either way (checked), and a NaN total needs `q = nan` | Declined |
| Add type hints and docstrings to every new function | No | Yes | Noise for a behavior-preserving refactor | Declined, out of scope |

Summary:
- **AI found that we missed:** the helpers have no direct unit tests, and they are now public names other code could depend on. Both are real and cheap to fix.
- **We found that AI missed:**
  - The misleading FREEDRINK comment. It only existed in a step diff, so a reviewer who sees just the final PR can't catch it; reading each step mattered.
  - That more tests weren't enough. The AI's answer to untested inputs was "write more tests", while ours was to compare against the old code on every input combination, which is what proved 0 differences.
- **AI comments that were wrong or noise (count):** 2 of 9 (the NaN fee band, type hints). One more was half right: the clamp is unreachable, but removing it is the wrong call.
- **Would we keep using it? Which rules or instructions would we add?** Yes, as a second pass after our own diff read, not instead of it. We'd add these instructions:
  - "This is a behavior-preserving refactor: only report a behavior change if you give an input and the old and new outputs."
  - "Ignore style (type hints, docstrings) unless asked."
  - "Check every comment against the code it describes."
  
  One limit: the same model that helped write the refactor also reviewed it, so it was less independent than Copilot or CodeRabbit would be. Next time we'd use a different tool.
