# Complexity: the five most complex functions (D12, #165)

Measured on 2026-11-28 at `main` `0e53f9d`, with ESLint's `complexity` rule
(cyclomatic complexity: 1, plus one for every `if`, loop, `case`, `catch`,
`&&`, `||`, `??` and `?:`). Re-run it with:

```bash
npm run complexity        # the top 5
npm run complexity -- 15  # the top 15
```

`scripts/complexity.mjs` switches the rule on for that run only, at a
threshold of 0 so every function reports a score. It covers every file in
`src/` except the tests and the generated `database.types.ts`.

**Overall:** 581 functions, with a mean complexity of **3.0**. 25 are above
10, McCabe's original suggested limit, and 6 are above 20, the threshold
ESLint's rule uses by default.

## The five most complex functions

| # | Function | Complexity | Where | Branch coverage of its file |
| --- | --- | --- | --- | --- |
| 1 | `PlacesPicker` | **41** | `src/components/PlacesPicker.tsx:82` | 93% |
| 2 | `CreateSessionForm` | 30 | `src/components/CreateSessionForm.tsx:143` | 88% |
| 3 | `saveProfile` | 22 | `src/app/profile/actions.ts:54` | 95% |
| 4 | `CourseNumberInput` | 22 | `src/components/CourseNumberInput.tsx:58` | 79% |
| 5 | `CodeStep` | 22 | `src/components/SignInForm.tsx:352` | 90% |

Coverage is from `npm run test:coverage` on the same code.

Four of the five are React components. That inflates their scores: each
`{error && <p>…</p>}` and `cond ? a : b` in the markup counts as a branch.
The ranking is still a fair pointer, though. All four are forms or
comboboxes, which hold the most state of anything in the app.

## Without the components

The same measurement over `.ts` files only, which is the logic without the markup:

| # | Function | Complexity | Where |
| --- | --- | --- | --- |
| 1 | `saveProfile` | 22 | `src/app/profile/actions.ts:54` |
| 2 | `parseAutocompleteResponse` | 13 | `src/lib/place-search.ts:145` |
| 3 | `createSession` | 12 | `src/app/sessions/actions.ts:62` |
| 4 | `localInputToIso` | 11 | `src/lib/datetime-local.ts:67` |
| 5 | `editSession` | 10 | `src/app/sessions/actions.ts:181` |

## What we make of it

- **`PlacesPicker` (41)** is a combobox and a state machine in one function.
  It handles typed text, a debounced Google search that can be cancelled, a
  keyboard-driven listbox, the chosen place, and a map pin. A `usePlaceSearch()`
  hook for the search and a separate listbox component would each be small
  enough to test alone. It has no test file of its own: its 93% comes from
  `CreateSessionForm`'s tests. Of the five, it is the riskiest to change.
- **`saveProfile` (22)** is the most complex piece of server logic. It is
  five sequential database steps, each with its own failure path, which is
  why it scores high. It is also 95% branch-covered, and the database tests
  check its rules. Splitting it into one function per step would lower the
  number without making the code easier to follow, so we leave it.
- **`CourseNumberInput` (22, 79% of branches)** is the least tested of the five.
  Like `PlacesPicker`, it has no test file of its own. If one of these gets
  attention before the release, it should be this one: a test file for its
  typeahead states.
- **`CreateSessionForm` and `CodeStep`** mostly score for their markup: one
  conditional per field error and per pending state.

Nothing here blocks the release. The mean is low (3.0), and the complex
functions are the ones with the most tests around them, apart from the two
comboboxes.
