// The mobile app's own test config. Without it, vitest searches parent
// folders and loads the web app's vitest.config.mts, whose plugins are not
// installed here. Pure logic only: no React Native renderer, no device.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
