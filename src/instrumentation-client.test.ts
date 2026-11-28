import { afterEach, describe, expect, it, vi } from "vitest";

// The browser's Sentry start-up (V7, #153): only in a build with a DSN.

const sentry = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

async function load() {
  vi.resetModules();
  await import("./instrumentation-client");
  // The SDK is a dynamic import; let it settle.
  await vi.waitFor(() => Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("instrumentation-client", () => {
  it("does not start Sentry in a build without NEXT_PUBLIC_SENTRY_DSN", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    await load();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts it with the scrubbing options when the build has one", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc@o1.ingest.us.sentry.io/2");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    await load();
    expect(sentry.init).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ environment: "production", sendDefaultPii: false, tracesSampleRate: 0 }),
    );
  });

  it("never throws if the SDK fails to load", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc@o1.ingest.us.sentry.io/2");
    sentry.init.mockImplementation(() => {
      throw new Error("blocked by an ad blocker");
    });
    await expect(load()).resolves.toBeUndefined();
  });
});
