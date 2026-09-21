# ADR 0004 — Mobile-first, list before map

**Status:** Accepted · **Date:** 2026-09-17

## Context

Nothing in the Requirements Analysis Report mentions mobile, responsive layout,
or accessibility. But the product's own user story is a student who wants to
find a study group *right now* — which means they are holding a phone, probably
walking, probably between classes. A desktop-first design would be built for a
situation that does not occur.

The map is also the hardest element to get right on a small screen: pins
overlap at campus zoom, popups cover the map, and precise tapping while walking
is unreliable.

## Decision

**Design for a phone first. The list view is the default; the map is a toggle.**

- Every layout is single-column with a `max-w-*` cap, not a desktop grid that
  collapses.
- Tap targets are at least 44px; inputs use `text-base` (16px) so iOS Safari
  does not zoom on focus.
- `SessionBrowser` opens on the list. The map is one tap away and renders at
  `60dvh` so the filter controls stay reachable.
- The map component is loaded client-side only — the Maps JavaScript API needs
  a browser, and deferring it keeps a sizeable script out of the initial load
  for the majority of visits that never open the map.

## Consequences

**Good.** Matches how the app is actually used. The list is faster to scan than
a map when you already know your course, which is the common case.

**Bad.** The map is the demo-friendly feature and it is now the secondary view.
Accept this: the demo can open the map deliberately.

**Accessibility baseline** (previously unmentioned anywhere): semantic
elements, labels on every input, `role="alert"` on error messages,
`role="log"` with `aria-live="polite"` on the chat, and visible focus states.
This is a floor, not an audit — a keyboard and screen-reader pass is TASK-04.
