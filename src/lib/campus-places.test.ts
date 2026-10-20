import { describe, expect, it } from "vitest";

import { isWithinCampus } from "@/lib/geo";

import {
  CAMPUS_PLACES,
  findCampusPlace,
  isCampusPlaceId,
  KIND_LABEL,
  searchCampusPlaces,
  STARTER_PLACE_IDS,
  type CampusPlace,
} from "./campus-places";

const names = (places: CampusPlace[]) => places.map((place) => place.name);

describe("the campus list", () => {
  it("has unique, well-formed ids", () => {
    const ids = CAMPUS_PLACES.map((place) => place.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isCampusPlaceId(id), id).toBe(true);
  });

  it("puts every place inside the campus circle resolvePlace() enforces", () => {
    for (const place of CAMPUS_PLACES) expect(isWithinCampus(place), place.name).toBe(true);
  });

  it("gives every place a known kind and an OpenStreetMap name", () => {
    for (const place of CAMPUS_PLACES) {
      expect(KIND_LABEL[place.kind], place.name).toBeDefined();
      expect(place.osm.length, place.name).toBeGreaterThan(0);
    }
  });

  it("starts with places that exist", () => {
    for (const id of STARTER_PLACE_IDS) expect(findCampusPlace(id), id).toBeDefined();
  });
});

describe("isCampusPlaceId", () => {
  it.each(["vu-sarratt-student-center", "vu-a1"])("accepts %s", (id) => {
    expect(isCampusPlaceId(id)).toBe(true);
  });
  it.each(["vu-", "vu-Sarratt", "vu--x", "vu-x-", "ChIJ123", "vu-x y", " vu-x"])("refuses %j", (id) => {
    expect(isCampusPlaceId(id)).toBe(false);
  });
});

describe("findCampusPlace", () => {
  it("finds by id and nothing else", () => {
    expect(findCampusPlace("vu-featheringill-hall")?.name).toBe("Featheringill Hall");
    expect(findCampusPlace("vu-nowhere")).toBeUndefined();
  });
});

describe("searchCampusPlaces", () => {
  it("lists the starter places for an empty query", () => {
    expect(searchCampusPlaces("  ").map((p) => p.id)).toEqual([...STARTER_PLACE_IDS]);
    expect(searchCampusPlaces("", 2)).toHaveLength(2);
  });

  it("finds by the start of a name", () => {
    expect(names(searchCampusPlaces("Feath"))[0]).toBe("Featheringill Hall");
    expect(names(searchCampusPlaces("sarratt"))[0]).toBe("Sarratt Student Center");
  });

  it("finds by nickname, below a real-name match", () => {
    expect(names(searchCampusPlaces("EBI"))[0]).toBe("E. Bronson Ingram Dining Hall");
    expect(names(searchCampusPlaces("the rec"))[0]).toBe("Student Recreation Center");
  });

  it("matches words in any order, and words spread over name and nicknames", () => {
    expect(names(searchCampusPlaces("hall feath"))).toContain("Featheringill Hall");
    expect(names(searchCampusPlaces("stevenson math"))[0]).toBe("Stevenson Center Mathematics");
    expect(names(searchCampusPlaces("stevenson chemistry"))[0]).toBe("Stevenson Center");
  });

  it("matches inside a name, ignoring case, accents and punctuation", () => {
    expect(names(searchCampusPlaces("biomedical"))).toContain("Eskind Biomedical Library");
    expect(names(searchCampusPlaces("JENIS"))).toContain("Jeni's Splendid Ice Creams");
    expect(names(searchCampusPlaces("café"))).toEqual([]);
    expect(names(searchCampusPlaces("barnes & noble"))).toContain("Vanderbilt University Bookstore");
  });

  it("ranks an exact name first, then shorter names", () => {
    const list: CampusPlace[] = [
      { id: "vu-library-annex", name: "Library Annex", kind: "library", lat: 0, lng: 0, osm: "x" },
      { id: "vu-library", name: "Library", kind: "library", lat: 0, lng: 0, osm: "x" },
      { id: "vu-big-library", name: "Big Library", kind: "library", lat: 0, lng: 0, osm: "x" },
      { id: "vu-a-library", name: "A Library", kind: "library", lat: 0, lng: 0, osm: "x" },
    ];
    expect(names(searchCampusPlaces("library", 6, list))).toEqual([
      "Library",
      "Library Annex",
      "A Library",
      "Big Library",
    ]);
  });

  it("finds nothing for nonsense, and stops at the limit", () => {
    expect(searchCampusPlaces("zzzz")).toEqual([]);
    expect(searchCampusPlaces("hall", 3)).toHaveLength(3);
  });
});
