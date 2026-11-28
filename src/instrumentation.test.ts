// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The server's Sentry wiring (V7, #153). What the options contain is tested
// in src/lib/monitoring.test.ts; here, only that Sentry is started when --
// and only when -- a DSN is set, and that request errors reach it then.

const sentry = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

const DSN = "https://abc123@o4500000000000000.ingest.us.sentry.io/4500000000000001";
const ERROR = new Error("boom");
const REQUEST = { path: "/sessions", method: "GET", headers: {} };
const CONTEXT = {
  routerKind: "App Router",
  routePath: "/sessions",
  routeType: "render",
  revalidateReason: undefined,
} as const;

async function freshModule() {
  vi.resetModules();
  return import("./instrumentation");
}

beforeEach(() => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("register / onRequestError", () => {
  it("starts nothing and reports nothing without a DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const { register, onRequestError } = await freshModule();

    await register();
    await onRequestError(ERROR, REQUEST, CONTEXT);

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it("starts Sentry with the deployment's name and commit, and reports request errors", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    vi.stubEnv("APP_ENVIRONMENT", "production");
    vi.stubEnv("APP_COMMIT_SHA", "0e53f9d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7");
    const { register, onRequestError } = await freshModule();

    await register();
    await onRequestError(ERROR, REQUEST, CONTEXT);

    expect(sentry.init).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        dsn: DSN,
        environment: "production",
        release: "0e53f9d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7",
        sendDefaultPii: false,
      }),
    );
    expect(sentry.captureRequestError).toHaveBeenCalledExactlyOnceWith(ERROR, REQUEST, CONTEXT);
  });

  it("does nothing outside the Node.js runtime", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await freshModule();

    await register();

    expect(sentry.init).not.toHaveBeenCalled();
  });
});
