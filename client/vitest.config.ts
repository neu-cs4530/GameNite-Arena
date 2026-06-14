import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/testSetup.ts",
    // Unit tests only — the e2e suite is Playwright's (tests/e2e). Both
    // suffixes are live: pre-harness pure-logic tests use `.spec.ts`, newer
    // component tests use `.test.tsx`.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
