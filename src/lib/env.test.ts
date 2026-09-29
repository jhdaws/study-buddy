import { afterEach, describe, expect, it, vi } from "vitest";

import { googleMapsServerKey, supabaseEnv } from "./env";

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("supabaseEnv", () => {
  it("returns the URL and key when both are set", () => {
    vi.stubEnv(URL_VAR, "https://abc123.supabase.co");
    vi.stubEnv(KEY_VAR, "sb_publishable_test");

    expect(supabaseEnv()).toEqual({
      url: "https://abc123.supabase.co",
      anonKey: "sb_publishable_test",
    });
  });

  it("names the variable that is missing", () => {
    vi.stubEnv(URL_VAR, "https://abc123.supabase.co");
    vi.stubEnv(KEY_VAR, "");

    expect(() => supabaseEnv()).toThrow(KEY_VAR);
  });

  it("rejects a Postgres connection string pasted as the URL", () => {
    vi.stubEnv(URL_VAR, "postgresql://postgres:secret@db.abc123.supabase.co:5432/postgres");
    vi.stubEnv(KEY_VAR, "sb_publishable_test");

    expect(() => supabaseEnv()).toThrow(/not a postgresql:\/\/ connection string/);
  });
});

describe("googleMapsServerKey", () => {
  it("throws rather than returning undefined when unset", () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "");

    expect(() => googleMapsServerKey()).toThrow("GOOGLE_MAPS_SERVER_API_KEY");
  });
});
