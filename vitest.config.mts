import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    // `npm run test:coverage` (TEST_PLAN.md). Every source file counts, tested
    // or not -- otherwise a file no test imports would not lower the number.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/lib/database.types.ts"],
      reporter: ["text", "json-summary", "html"],
      // The coverage gate (W9, #48). Floors just under what main measured on
      // 2026-10-16 -- 82.8% branches, 83.1% lines, 76.5% functions, 82.4%
      // statements, 94.0% of src/lib's branches -- and above TEST_PLAN.md's
      // Sprint 3 targets. CI runs `npm run test:coverage`, so a PR that drops
      // below any of them fails. Raise them as coverage grows; never lower
      // them to get a PR through.
      thresholds: {
        branches: 80,
        lines: 80,
        statements: 80,
        functions: 75,
        "src/lib/**": { branches: 90 },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js resolves "server-only" itself; the npm package is not
      // installed. Without this, Vitest cannot load places.ts, sessions.ts or
      // supabase/admin.ts -- and coverage silently leaves them out of the
      // total instead of counting them as untested. Next's own empty module,
      // so tests import them as the server does.
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
