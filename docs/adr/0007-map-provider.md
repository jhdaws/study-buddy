# ADR 0007 — Google Maps and Places, with a curated campus layer

**Status:** Accepted · **Date:** 2026-09-21
**Superseded in part by [ADR 0008](./0008-sprint-2-schema-decisions.md)** — no curated campus layer (every location comes from Places), and the server key is restricted by API and quota, not IP. See its rules 7 and 13–15.
**Supersedes:** the Leaflet/OpenStreetMap choice in [ADR 0001](./0001-stack.md)
and the location half of [ADR 0002](./0002-reference-data.md)

## Context

Sessions need a location. That is really two problems:

- **Campus academic buildings** — a small, stable set. Students refer to them by
  names and nicknames that no general-purpose map uses.
- **Nearby venues** — coffee shops, public libraries, and similar. A larger set
  that changes over time and that we have no authoritative source for.

The earlier plan (ADR 0002) was to hand-compile both and render them with
Leaflet over OpenStreetMap tiles. That avoided a billing account and kept the
data ours, but it put a real amount of manual data-gathering on the team for
the venue half — which is exactly the half that changes.

The team is not bound to Leaflet or to avoiding a billing relationship.

## Decision

**Google Maps as the basemap. Google Places for venue search. Our own curated
campus buildings drawn on top as a separate layer.**

Each half is solved by whichever source is actually good at it:

| Half | Source | Why |
| --- | --- | --- |
| Campus buildings | Curated by us | Names match what students say — "Featheringill", "Stevenson" — and quality does not depend on a third party |
| Nearby venues | Google Places | Discovery and geocoding are the manual work we want to avoid |

Rendering our own markers on a Google map is ordinary and permitted. What is
*not* permitted is displaying Google Places data on a non-Google map — which is
what rules out keeping Leaflet while adopting Places.

### Restricting selection to campus

Place Autocomplete takes a **`locationRestriction`** — a circle around campus.
It is a hard filter: results outside it are not returned. This is distinct from
`locationBias`, which is a soft preference and would still surface results
across Nashville.

Pair it with **`includedPrimaryTypes`** (`cafe`, `library`, `restaurant`, and
similar) so the picker offers public venues and not private residences.

Radius is deliberately not fixed here. Start around campus plus the immediate
surrounding blocks and tune it once real sessions exist. It should be a single
configured constant, not a number scattered through the code.

### The client filter is not the control

`locationRestriction` shapes what the picker offers. It does not stop anyone
from calling our API directly with a location on the other side of the city.

**Re-validate server-side**: before writing a session, confirm the submitted
coordinates fall within the allowed radius. Same principle as everywhere else
in this project — the convenient check is in the UI, the real one is at the
boundary the attacker cannot skip.

### Cost control

Use **session tokens** on autocomplete. They bill a full typing session plus
the subsequent Details call as one unit rather than one per keystroke. Omitting
them is the usual reason a Places bill is surprising.

## Consequences

**Good.** The venue half stops being manual work. Coordinates come from Google
rather than from anyone guessing. Campus buildings stay under our control and
keep their real names.

**Bad: a billing account with a credit card is required**, even to stay within
the free tier. Someone on the team owns that. Settle whose before building on
it.

**Bad: we do not own the venue data.** Google's terms restrict caching Place
details; `place_id` may be stored long-term, most other fields may not. So a
venue row stores the `place_id` and the coordinates we validated, and details
are re-fetched rather than owned. Acceptable at our scale, but it means the
venue picker has a runtime dependency on Google being up.

**Watch: API keys for Maps JavaScript are public by necessity** — they ship in
client-side JavaScript. They are not a secret and must be restricted in the
Google Cloud console by HTTP referrer and by API. A separate, IP-restricted key
should be used for any server-side validation call. An unrestricted key in a
public repository is the classic way a student project acquires a bill.

**Watch: free-tier terms changed in 2025.** Verify current pricing and limits
directly rather than trusting any summary, including this one.

## Rejected

- **Leaflet + OpenStreetMap with a one-time Overpass import.** Genuinely viable:
  no billing, no caching limits, data fully ours. Rejected because the team
  preferred not to own the venue-gathering work, which is the half that decays.
  Worth revisiting if the billing account becomes a problem.
- **Esri / ArcGIS Location Platform.** Comparable capability to Google and a
  free developer tier, but a lateral move — the same terms-verification
  homework, with less chance anyone on the team has prior experience.
- **Free-form address entry.** Not offered at any point. Selection is limited to
  curated campus buildings and public venues inside the radius. This platform
  sends students to meet strangers in person; arbitrary address input means a
  session can be posted at a private residence. Related: US-18, US-22, US-23.

## Still open

**Vanderbilt's own campus GIS data.** Universities often publish authoritative
campus layers — building footprints, official names, entrances, accessibility
routes — through an ArcGIS Online organization or an open-data portal. If
Vanderbilt does, it is strictly better than hand-curating the campus half, and
it is free.

Worth an email to Facilities or VU IT. Do it **in parallel** — hand-curate the
core buildings now rather than blocking on an answer with an unknown timeline.
