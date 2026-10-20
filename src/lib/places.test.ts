// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAMPUS_CENTER } from "@/lib/env";
import { FIXTURE_LOCATIONS } from "@/lib/fixtures";

import { PlaceError, resolvePlace } from "./places";

// resolvePlace() (M3) with its I/O replaced: Google's Place Details by a
// stubbed fetch, the secret-key client by a fake that records the upsert, and
// getCurrentUser() by a switch. The rules themselves are tested in
// place-policy.test.ts and geo.test.ts; these tests check the order of the
// checks, what reaches Google and the database, and that every refusal is a
// PlaceError with our own message. W9 (#48), TEST_PLAN.md "Next tests".

const admin = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  result: { data: { id: "loc-1" } as { id: string } | null, error: null as unknown },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: admin.from }),
}));

const session = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
// The cookie client, for campus places: records the place_id it was asked for.
const userDb = vi.hoisted(() => ({
  eq: vi.fn(),
  result: { data: { id: "loc-campus" } as { id: string } | null, error: null as unknown } as
    | { data: { id: string } | null; error: unknown }
    | Promise<never>,
}));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: async () => session.user,
  createClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          userDb.eq(table, columns, column, value);
          return { maybeSingle: async () => userDb.result };
        },
      }),
    }),
  }),
}));

const PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const ON_CAMPUS = { latitude: CAMPUS_CENTER.lat + 0.001, longitude: CAMPUS_CENTER.lng };
// About 5 km north of CAMPUS_CENTER: well outside CAMPUS_RADIUS_METERS.
const FIVE_KM_AWAY = { latitude: CAMPUS_CENTER.lat + 0.045, longitude: CAMPUS_CENTER.lng };
const LIBRARY_TYPES = ["library", "point_of_interest", "establishment"];

const fetchMock = vi.fn();

/** What fetch() resolves to: just the parts lookUpPlace() reads. */
function googleReplies(status: number, body: unknown) {
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

async function refusal(promise: Promise<unknown>): Promise<PlaceError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(PlaceError);
  return error as PlaceError;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "test-server-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  session.user = { id: "u1" };
  admin.result = { data: { id: "loc-1" }, error: null };
  userDb.result = { data: { id: "loc-campus" }, error: null };
  admin.from.mockImplementation(() => ({ upsert: admin.upsert }));
  admin.upsert.mockImplementation(() => ({
    select: () => ({ single: async () => admin.result }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  admin.from.mockReset();
  admin.upsert.mockReset();
  userDb.eq.mockReset();
});

describe("resolvePlace: curated campus places", () => {
  it("reads the place's own locations row as the signed-in user, without Google or the secret key", async () => {
    await expect(resolvePlace("vu-featheringill-hall")).resolves.toEqual({ locationId: "loc-campus" });
    expect(userDb.eq).toHaveBeenCalledWith("locations", "id", "place_id", "vu-featheringill-hall");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it.each(["vu-nowhere-hall", "vu-Featheringill-Hall", "vu-"])(
    "refuses %j, which is not on the list, as unknown_place without reading",
    async (id) => {
      expect((await refusal(resolvePlace(id))).reason).toBe("unknown_place");
      expect(userDb.eq).not.toHaveBeenCalled();
    },
  );

  it("is lookup_failed when the row is missing (migration not applied, or nobody signed in)", async () => {
    userDb.result = { data: null, error: null };
    expect((await refusal(resolvePlace("vu-central-library"))).reason).toBe("lookup_failed");
  });

  it("never puts Postgres's text in the error, and survives a thrown read", async () => {
    userDb.result = { data: null, error: { code: "42501", message: "permission denied for table locations" } };
    const denied = await refusal(resolvePlace("vu-central-library"));
    expect(denied.reason).toBe("lookup_failed");
    expect(denied.message).not.toMatch(/permission|42501/);

    userDb.result = Promise.reject(new TypeError("fetch failed"));
    expect((await refusal(resolvePlace("vu-central-library"))).reason).toBe("lookup_failed");
  });
});

describe("resolvePlace: a real place", () => {
  it("looks it up with only location and types, then stores Google's coordinates", async () => {
    googleReplies(200, { location: ON_CAMPUS, types: LIBRARY_TYPES });

    await expect(resolvePlace(PLACE_ID)).resolves.toEqual({ locationId: "loc-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://places.googleapis.com/v1/places/${PLACE_ID}`);
    expect(init.headers).toEqual({
      "X-Goog-Api-Key": "test-server-key",
      "X-Goog-FieldMask": "location,types",
    });
    expect(init.cache).toBe("no-store");

    expect(admin.from).toHaveBeenCalledWith("locations");
    const [row, options] = admin.upsert.mock.calls[0];
    expect(row).toMatchObject({
      place_id: PLACE_ID,
      lat: ON_CAMPUS.latitude,
      lng: ON_CAMPUS.longitude,
    });
    expect(Date.parse(row.validated_at)).not.toBeNaN();
    expect(options).toEqual({ onConflict: "place_id" });
  });

  it("passes a well-formed Autocomplete session token, and drops a malformed one", async () => {
    googleReplies(200, { location: ON_CAMPUS, types: LIBRARY_TYPES });
    await resolvePlace(PLACE_ID, { sessionToken: "a1b2-c3d4" });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("sessionToken")).toBe(
      "a1b2-c3d4",
    );

    await resolvePlace(PLACE_ID, { sessionToken: "not a token; drop table" });
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.has("sessionToken")).toBe(
      false,
    );
  });
});

describe("resolvePlace: refusals happen before anything is written", () => {
  it("refuses a place 5 km from campus as outside_campus", async () => {
    googleReplies(200, { location: FIVE_KM_AWAY, types: LIBRARY_TYPES });

    const error = await refusal(resolvePlace(PLACE_ID));

    expect(error.reason).toBe("outside_campus");
    expect(error.message).toBe("That place is too far from campus. Choose somewhere closer.");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("refuses a residence as excluded_type, even on campus", async () => {
    googleReplies(200, {
      location: ON_CAMPUS,
      types: ["apartment_building", "point_of_interest", "establishment"],
    });

    expect((await refusal(resolvePlace(PLACE_ID))).reason).toBe("excluded_type");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("refuses a malformed id without calling Google", async () => {
    expect((await refusal(resolvePlace("../../etc/passwd"))).reason).toBe("unknown_place");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("in production, refuses a lookup with nobody signed in, without calling Google", async () => {
    vi.stubEnv("NODE_ENV", "production");
    session.user = null;

    expect((await refusal(resolvePlace(PLACE_ID))).reason).toBe("lookup_failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolvePlace: Google's failures", () => {
  it.each([
    [404, { error: { status: "NOT_FOUND" } }, "unknown_place"],
    [400, { error: { status: "INVALID_ARGUMENT" } }, "unknown_place"],
    [
      400,
      { error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } },
      "lookup_failed",
    ],
    [403, { error: { status: "PERMISSION_DENIED" } }, "lookup_failed"],
    [500, null, "lookup_failed"],
  ])("maps HTTP %i to %s", async (status, body, reason) => {
    googleReplies(status, body);
    expect((await refusal(resolvePlace(PLACE_ID))).reason).toBe(reason);
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("turns a network failure or timeout into lookup_failed", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect((await refusal(resolvePlace(PLACE_ID))).reason).toBe("lookup_failed");
  });

  it("treats a reply with no usable location as lookup_failed", async () => {
    googleReplies(200, { types: LIBRARY_TYPES });
    expect((await refusal(resolvePlace(PLACE_ID))).reason).toBe("lookup_failed");
  });
});

describe("resolvePlace: storing", () => {
  it("never puts Postgres's text in the error a student sees", async () => {
    googleReplies(200, { location: ON_CAMPUS, types: LIBRARY_TYPES });
    admin.result = {
      data: null,
      error: { code: "42501", message: 'permission denied for table "locations"' },
    };

    const error = await refusal(resolvePlace(PLACE_ID));

    expect(error.reason).toBe("lookup_failed");
    expect(error.message).not.toMatch(/permission|locations/);
  });
});

describe("resolvePlace: fixture places (the stub picker, until M2)", () => {
  const fixture = FIXTURE_LOCATIONS[0];

  it("resolves a fixture id outside production, without Google or the database", async () => {
    await expect(resolvePlace(fixture.place_id)).resolves.toEqual({ locationId: fixture.id });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("still resolves one in production while there is no server key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "");
    await expect(resolvePlace(fixture.place_id)).resolves.toEqual({ locationId: fixture.id });
  });

  it("refuses one in production once the server key is set, still without calling Google", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await refusal(resolvePlace(fixture.place_id))).reason).toBe("unknown_place");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolvePlace: missing configuration", () => {
  it("fails loudly, not as a student-facing PlaceError, when the server key is missing", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "");
    const error = await resolvePlace(PLACE_ID).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PlaceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
