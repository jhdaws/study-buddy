import { afterEach, describe, expect, it, vi } from "vitest";

import { reportClientError } from "./monitoring-client";

// Errors an error boundary caught (V7, #153).

const sentry = vi.hoisted(() => ({ getClient: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("reportClientError", () => {
  it("sends nothing in a build without browser monitoring", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    await reportClientError(new Error("x"));
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("sends the error once Sentry has started", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc@o1.ingest.us.sentry.io/2");
    sentry.getClient.mockReturnValue({});
    const error = new Error("render failed");

    await reportClientError(error);

    expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("does not start Sentry itself, and never throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc@o1.ingest.us.sentry.io/2");
    sentry.getClient.mockReturnValue(undefined);
    await reportClientError(new Error("early"));
    expect(sentry.captureException).not.toHaveBeenCalled();

    sentry.getClient.mockImplementation(() => {
      throw new Error("sdk broke");
    });
    await expect(reportClientError(new Error("x"))).resolves.toBeUndefined();
  });
});
