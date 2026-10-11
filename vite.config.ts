/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  // Vitest runs Svelte components through the server (SSR) build unless the
  // "browser" package-export condition is forced, which breaks mount()-based
  // component tests (@testing-library/svelte). Store-level tests aren't
  // affected since they never import a .svelte file.
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["**/node_modules/**", "**/.claude/**", "**/dist/**"],
  },
});
