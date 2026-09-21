# Reference data

Seed data loaded into the database. Lands with the database push.

## Courses — decided ([ADR 0006](../docs/adr/0006-course-model.md))

- **`departments.json`** — the closed set of subject codes (`CS`, `MATH`, …)
  with full names. Roughly 100–150 rows, compiled from the public catalog.
  This is the only course data we seed. **TASK-02.**

- **Course numbers are not seeded.** They are created on first use: a student
  picks a department and types a number, and that becomes a suggestion for
  everyone after. See ADR 0006 for normalization and validation rules.

## Locations — decided ([ADR 0007](../docs/adr/0007-map-provider.md))

Google Maps for the basemap, Google Places for nearby venues, and our own
curated campus buildings rendered on top.

- **`buildings.json`** — the core Vanderbilt academic buildings: id, name,
  campus zone, coordinates. Curated by hand so names match what students
  actually say ("Featheringill", "Stevenson"). Roughly 25 rows. **TASK-01.**

- **Nearby venues are not seeded.** They come from Place Autocomplete at
  session-creation time, restricted to a radius around campus. We store the
  `place_id` and the coordinates we validated — Google's terms restrict
  caching most other Place fields.

### Still worth asking

Vanderbilt may publish authoritative campus GIS building data (footprints,
official names, entrances). If it exists it beats hand-curation and it is
free — **TASK-07**. Ask in parallel; do not block TASK-01 on the answer.

### The constraint that does not change

**No free-form address entry.** Selection is limited to curated campus
buildings and public venues inside the radius, and that radius is re-checked
on the server — the autocomplete filter is a UX convenience, not a control.

This platform sends students to meet people they do not know, in person.
Arbitrary address input means someone can post a session at a private
residence. Related: US-18, US-22, US-23.
