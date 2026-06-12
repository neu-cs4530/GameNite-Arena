import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/testSetup.ts",
    // Unit tests only — the e2e suite is Playwright's (tests/e2e).
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
