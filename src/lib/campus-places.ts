// The places a study session can be held: a curated list of public Vanderbilt
// spots, with their coordinates. Owner: Track M (US-02). 2026-10-20.
//
// Built the way Pakita's host dashboard finds buildings
// (moses-banda/pakita-framework, apps/host/src/lib/places.ts): a fixed list
// with nicknames, searched by name, and a free OpenStreetMap map -- no Google
// key and no bill. The list started from Moses's Vanderbilt campus map
// (names and addresses only); the coordinates were looked up once in
// OpenStreetMap (data/campus_places.json says when) and are committed, so
// nothing is geocoded at runtime.
//
// This REVERSES ADR 0008 rule 7 ("no curated building list"): see the
// 2026-10-20 note in that ADR.
//
// Pure: no I/O, safe for Client Components. The same list, written as
// `locations` rows by a migration, is what resolvePlace() hands back -- the
// server never stores coordinates a browser sent.

import data from "../../data/campus_places.json";

export type CampusPlaceKind = "building" | "library" | "dining" | "cafe" | "outdoor";

export type CampusPlace = {
  /** `vu-<slug>`: the value the picker submits and `locations.place_id`. */
  id: string;
  name: string;
  /** Other names students use: "EBI", "the Rec", "Sarratt". */
  aliases?: string[];
  kind: CampusPlaceKind;
  lat: number;
  lng: number;
  /** The name OpenStreetMap has for the point, kept for re-checking. */
  osm: string;
};

export const CAMPUS_PLACES: readonly CampusPlace[] = data.places as CampusPlace[];

/** What every curated id starts with; Google ids never do. */
export const CAMPUS_PLACE_PREFIX = "vu-";

/** Lower-case slug, a-z0-9 and single hyphens, after the prefix. */
const CAMPUS_ID = /^vu-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isCampusPlaceId(id: string): boolean {
  return CAMPUS_ID.test(id);
}

const BY_ID = new Map(CAMPUS_PLACES.map((place) => [place.id, place]));

export function findCampusPlace(id: string): CampusPlace | undefined {
  return BY_ID.get(id);
}

/** The second line under a suggestion. */
export const KIND_LABEL: Record<CampusPlaceKind, string> = {
  building: "Campus building",
  library: "Library",
  dining: "Dining",
  cafe: "Café near campus",
  outdoor: "Outdoors on campus",
};

/** Shown before the host types anything. */
export const STARTER_PLACE_IDS: readonly string[] = [
  "vu-central-library",
  "vu-featheringill-hall",
  "vu-stevenson-center",
  "vu-sarratt-student-center",
  "vu-eskind-biomedical-library",
  "vu-the-commons-center",
];

const norm = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Places matching what the host typed, best first -- Pakita's scoring:
 * exact name 100, name starts with the query 80, every word starts a word
 * of the name 60, name contains the query 40; a nickname match scores 5
 * less than the same match on the real name; words spread across the name
 * and its nicknames ("stevenson math") 50. Ties go to the shorter name.
 * An empty query gives the starter list.
 */
export function searchCampusPlaces(
  query: string,
  limit = 6,
  list: readonly CampusPlace[] = CAMPUS_PLACES,
): CampusPlace[] {
  const q = norm(query);
  if (!q) {
    return STARTER_PLACE_IDS.flatMap((id) => list.filter((place) => place.id === id)).slice(0, limit);
  }
  const words = q.split(" ");
  const scored: { place: CampusPlace; score: number }[] = [];
  for (const place of list) {
    let best = 0;
    for (const label of [place.name, ...(place.aliases ?? [])]) {
      const n = norm(label);
      const nameWords = n.split(" ");
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 80;
      else if (words.every((w) => nameWords.some((x) => x.startsWith(w)))) score = 60;
      else if (n.includes(q)) score = 40;
      if (label !== place.name) score = Math.max(0, score - 5);
      best = Math.max(best, score);
    }
    if (best === 0 && place.aliases) {
      const all = norm([place.name, ...place.aliases].join(" ")).split(" ");
      if (words.every((w) => all.some((x) => x.startsWith(w)))) best = 50;
    }
    if (best > 0) scored.push({ place, score: best });
  }
  return scored
    .sort(
      (a, z) =>
        z.score - a.score ||
        a.place.name.length - z.place.name.length ||
        (a.place.name < z.place.name ? -1 : 1),
    )
    .slice(0, limit)
    .map((entry) => entry.place);
}
