// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  contentSecurityPolicy,
  createNonce,
  securityHeaders,
  type ContentSecurityPolicyOptions,
} from "./security-headers";

const HOSTED: ContentSecurityPolicyOptions = {
  nonce: "bm9uY2Utb2YtdGhlLWRheQ==",
  supabaseUrl: "https://abcdefgh.supabase.co",
  googleMaps: false,
  dev: false,
};

/** The policy as { directive: sources }, so tests ask about one directive at a time. */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split("; ").map((part) => {
      const [directive, ...sources] = part.split(" ");
      return [directive, sources];
    }),
  );
}

function policyFor(overrides: Partial<ContentSecurityPolicyOptions> = {}): Record<string, string[]> {
  return parse(contentSecurityPolicy({ ...HOSTED, ...overrides }));
}

describe("contentSecurityPolicy", () => {
  it("lets the Supabase project in over https and wss, taken from its URL", () => {
    expect(policyFor()["connect-src"]).toEqual([
      "'self'",
      "https://abcdefgh.supabase.co",
      "wss://abcdefgh.supabase.co",
    ]);
  });

  it("uses only the origin, whatever else the URL carries", () => {
    const connect = policyFor({ supabaseUrl: "https://abcdefgh.supabase.co/rest/v1/?x=1" })["connect-src"];
    expect(connect).toContain("https://abcdefgh.supabase.co");
    expect(connect).toContain("wss://abcdefgh.supabase.co");
    expect(connect.join(" ")).not.toContain("rest");
  });

  it("keeps the port and plain ws for the local stack, and does not upgrade it to https", () => {
    const policy = contentSecurityPolicy({ ...HOSTED, supabaseUrl: "http://127.0.0.1:54321" });
    expect(parse(policy)["connect-src"]).toEqual(["'self'", "http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("upgrades insecure requests when Supabase is on https", () => {
    expect(contentSecurityPolicy(HOSTED).split("; ")).toContain("upgrade-insecure-requests");
  });

  it("runs only scripts with this request's nonce, and never inline or eval'd code in production", () => {
    const script = policyFor()["script-src"];
    expect(script).toEqual(["'self'", "'nonce-bm9uY2Utb2YtdGhlLWRheQ=='", "'strict-dynamic'"]);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("allows eval and inline <style> in `next dev` only", () => {
    const dev = policyFor({ dev: true });
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["script-src"]).not.toContain("'unsafe-inline'");
    expect(dev["style-src"]).toContain("'unsafe-inline'");
    expect(policyFor()["style-src"]).toEqual(["'self'", "'nonce-bm9uY2Utb2YtdGhlLWRheQ=='"]);
  });

  it("allows style attributes, which a nonce cannot cover", () => {
    expect(policyFor()["style-src-attr"]).toEqual(["'unsafe-inline'"]);
  });

  it("forbids framing, plugins, and base or form targets elsewhere", () => {
    const policy = policyFor();
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
    expect(policy["default-src"]).toEqual(["'self'"]);
  });

  it("names no Google host without a Maps key", () => {
    const policy = contentSecurityPolicy(HOSTED);
    expect(policy).not.toMatch(/google|gstatic/);
    // Left out rather than empty: an empty directive would mean 'none'.
    expect(parse(policy)).not.toHaveProperty("worker-src");
    expect(parse(policy)).not.toHaveProperty("frame-src");
  });

  it("allows what Google's Maps JavaScript API guide lists, with a Maps key", () => {
    const policy = policyFor({ googleMaps: true });
    // maps.googleapis.com (the API), places.googleapis.com (the picker's
    // Places calls) and maps.gstatic.com are all inside these.
    expect(policy["connect-src"]).toEqual(
      expect.arrayContaining(["https://*.googleapis.com", "https://*.gstatic.com", "https://*.google.com"]),
    );
    expect(policy["img-src"]).toEqual(
      expect.arrayContaining([
        "data:",
        "blob:",
        "https://*.googleapis.com",
        "https://*.gstatic.com",
        "https://*.google.com",
        "https://*.googleusercontent.com",
      ]),
    );
    expect(policy["font-src"]).toEqual(["'self'", "https://fonts.gstatic.com"]);
    expect(policy["style-src"]).toContain("https://fonts.googleapis.com");
    expect(policy["worker-src"]).toEqual(["blob:"]);
    expect(policy["frame-src"]).toEqual(["https://*.google.com"]);
    // 'strict-dynamic' lets the loader's scripts in: no Google host, no eval.
    expect(policy["script-src"]).toEqual(["'self'", "'nonce-bm9uY2Utb2YtdGhlLWRheQ=='", "'strict-dynamic'"]);
    // And the Supabase sources are still there.
    expect(policy["connect-src"]).toContain("wss://abcdefgh.supabase.co");
  });

  it("is one header line: no newlines, directives separated by semicolons", () => {
    const policy = contentSecurityPolicy({ ...HOSTED, googleMaps: true, dev: true });
    expect(policy).not.toMatch(/[\r\n]/);
    expect(policy).not.toMatch(/;;|; ;|\s{2,}/);
  });
});

describe("createNonce", () => {
  it("is 128 bits of base64, different every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    }
  });
});

describe("securityHeaders", () => {
  it("sets nosniff, the referrer and permissions policies, and refuses framing", () => {
    expect(Object.fromEntries(securityHeaders().map(({ key, value }) => [key, value]))).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
      "X-Frame-Options": "DENY",
    });
  });
});
