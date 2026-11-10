# Code review given -- Group 4 reviewing Group 5   (docs/code-review/group5-review-given.md)
Last updated: 2026-11-08 · Reviewer on GitHub: Nate Dalbert (`natedal`) · Sprint 4 Part 1

Pull request reviewed: [hamayunrz/Pub-Order#18](https://github.com/hamayunrz/Pub-Order/pull/18),
"Feature/us23 cancel order", branch `feature/us23-cancel-order` → `main`, +423/−21 across 15 files.
Review posted 2026-11-08 as [`#pullrequestreview-5821245853`](https://github.com/hamayunrz/Pub-Order/pull/18#pullrequestreview-5821245853),
state **Changes requested**.

Their review brief asked us to look at five things: ownership, the cancel-versus-kitchen race,
database function safety, error handling, and whether the tests would fail if the logic broke.
The review answers each in order before the findings.

## 1. What we posted

Seven inline comments: 2 blocking, 4 suggestions, 1 praise.

| Type | File:line | Finding |
| --- | --- | --- |
| BLOCKING | `frontend/src/OrderPage.jsx:83` | `cancel()` does not join the stale-response guard that `refresh()` uses, so a read already in flight overwrites a successful cancel and the order visibly un-cancels |
| BLOCKING | `frontend/src/order-status.js:57` | Excluding `Cancelled` from `isOpenOrder()` files cancelled orders under the heading "Picked up" in the student's own order list |
| SUGGESTION | `backend/app/orders.py:210` | `42501` falls into the catch-all 503, so an expired session reads as a server fault and the sign-in recovery path is unreachable |
| SUGGESTION | `frontend/src/OrderPage.jsx:92` | The "too late" error can never be cleared once shown, because the button that would clear it has unmounted |
| SUGGESTION | `supabase/migrations/202611010001_cancel_order.sql:5` | Depends on an auto-generated constraint name and is not re-runnable (`drop constraint` without `if exists`, `create function` rather than `create or replace`) |
| SUGGESTION | `supabase/migrations/202611010001_cancel_order.sql:41` | The 409 message claims the kitchen has started the order, which is wrong for `Ready` and `Collected` |
| PRAISE | `supabase/migrations/202611010001_cancel_order.sql:29` | Collapsing ownership, status and write into one `UPDATE` genuinely closes the race in both directions, and idempotency falls out of it for free |

### Both blocking issues were reproduced, not argued

We ran their branch (`npm ci && npm test` in `frontend/` -- 233 passing) and wrote throwaway tests
against it. Neither bug is caught by their suite.

The cancel race, printing the status heading before and after the stale read lands:

```
[1] right after cancel         : [ 'Cancelled', 'Order summary' ]
[2] after the stale read lands : [ 'Waiting for the kitchen', 'Order summary' ] | cancel button back? true
```

The order list, rendering one `Received` and one `Cancelled` order:

```
[group headings]      [ 'In progress', 'Picked up' ]
[under "Picked up"]   Order #0A1B2C3D … Cancelled … View
```

A note on method: the first version of the race test used `vi.waitFor`, which retries until the
assertion passes and therefore reported a green result on a page that was visibly wrong. Replacing
it with a single `act()` flush and a synchronous assertion is what made the failure reproducible.
Worth remembering -- a retry helper will hide exactly the class of bug you are hunting.

## 2. AI-assisted review comparison

Required by Sprint 4 Part 1. We ran a second, independent pass with Claude Opus 5.5 given the diff
and read access to the branch, with no sight of our own findings, and asked for 6–12 findings
ordered by severity. It returned 11.

### What the AI flagged that we missed

| AI finding | Our assessment |
| --- | --- |
| **`MyOrders.jsx` files cancelled orders under "Picked up"** | **Correct, and we had missed it.** We verified it with a test before using it, and promoted it to our second blocking comment. We had been reading only the files in the diff; `MyOrders.jsx` is not in the diff, and the bug is caused at a distance by the one-line change to `isOpenOrder()`. The AI noticed that the PR makes exactly this fix in `Kitchen.jsx` and not in the student view -- a comparison we did not think to make |
| `cancelError` is never cleared once set | Correct. We verified and posted it as a suggestion |
| `roles.sql` performs a cancel without asserting the result | Correct, and fair. We had read that block as proving the kitchen cannot reopen a cancelled order, which it does, without noticing the student-side cancel itself asserts nothing |
| No `-cancelled` CSS, so a cancelled order keeps the active-order styling | Plausible, and out of scope -- their brief excludes styling, so we did not post it |
| `test_cancel_requires_a_token` does not exercise real token validation | Correct and a nice catch; the `signed_in` fixture stubs out `get_current_user`, so the 401 comes from the missing header only. Not posted; we were at seven comments and this is a naming issue, not a defect |
| `cancelOrder`'s response-validation line is untested | Correct. Not posted, same reason |
| The idempotency integration test never checks the returned status | Correct. Not posted, same reason |

### What we flagged that the AI missed

| Our finding | Why the AI missed it |
| --- | --- |
| **The 409 message is wrong for `Ready` and `Collected`** | The AI did raise the `55000` overloading, but framed it as a structural concern about one SQLSTATE meaning two things in two functions. It did not make the user-facing point that a student cancelling an order waiting at the counter is told the kitchen has started it |
| **The praise comment** | The AI's overall assessment did call the concurrency design correct, but it produced no positive finding -- its output is a defect list. A review with no genuine positive is worse at getting the defects accepted |
| **Answering the five questions in the brief** | The AI never saw the brief and so never addressed what Group 5 actually asked. Three of their five questions ("is anything missing?", "is 404 right?", "is the single UPDATE enough?") are answerable with a clear yes, and saying so is most of the value of the review to them |

### AI comments that were wrong or overstated

| AI claim | What is actually true |
| --- | --- |
| The cancel race means "a cancel that resolves after the student has navigated to a different order" can write the old order into the page | Not reachable. `OrderPage` is keyed by `orderId` and the mount effect's cleanup bumps `latestRequest`, so a remount cannot be overwritten this way. The real bug is narrower than claimed |
| `PGRST301` for an expired JWT also falls into the 503 branch | Unverified. We could not confirm from the code that `postgrest-py` surfaces that code as `APIError.code` here, so we left it out and kept the comment to the `42501` the migration demonstrably raises |
| Cites `frontend/src/orders.css` line numbers for missing `-cancelled` rules | The line references do not line up with the file. The underlying point stands, but the citations would not have survived a reviewer clicking them |

### What we concluded

The AI was clearly worth running: it found a real blocking defect we missed, and it was faster than
us at the mechanical question of "what else reads the thing you just changed". It was weaker at
judgement -- what is in scope, what the author team actually asked, what deserves to be said
positively -- and three of its eleven findings were wrong or unverifiable in ways that would have
cost us credibility if posted unchecked. Every AI finding we used was verified against the code
first, and the one we promoted to blocking was verified with a failing test.

The habit worth keeping: when a diff changes a shared helper, grep for every caller before
reviewing only the files in the diff. That single step would have found the `MyOrders` bug
ourselves.
