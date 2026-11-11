// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeRateLimit } from "./rate-limit";

// consumeRateLimit() with the Supabase client replaced. What the database
// counts, and when it refuses, is in tests/db/place-lookup-rate-limit.test.ts.

const server = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: server.rpc }),
}));

afterEach(() => {
  server.rpc.mockReset();
});

describe("consumeRateLimit (SEC-05)", () => {
  it("names only the bucket -- the database takes the student from their JWT", async () => {
    server.rpc.mockResolvedValue({ data: 19, error: null });

    expect(await consumeRateLimit("place_lookup")).toBeNull();
    expect(server.rpc).toHaveBeenCalledWith("consume_rate_limit", { p_bucket: "place_lookup" });
  });

  it("hands back the refusal for the caller to map", async () => {
    const refusal = { code: "PT429", message: "place_lookup_rate_limited", details: null };
    server.rpc.mockResolvedValue({ data: null, error: refusal });

    expect(await consumeRateLimit("place_lookup")).toBe(refusal);
  });
});
