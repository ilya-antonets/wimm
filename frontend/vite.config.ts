/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/__tests__/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/types/**",
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        // The plan targets ≥85% for the data-fetching hooks specifically.
        "src/hooks/**": {
          lines: 85,
          functions: 85,
        },
      },
    },
  },
});
