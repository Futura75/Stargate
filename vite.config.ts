/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  test: {
    exclude: ["**/node_modules/**", "**/.claude/**", "**/dist/**"],
  },
});
