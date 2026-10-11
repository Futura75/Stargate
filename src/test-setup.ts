import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/svelte";

// @testing-library/svelte doesn't auto-register cleanup outside of the
// jest/jasmine globals it detects, so each mounted component is torn down
// explicitly after every test to avoid leaking elements across tests.
afterEach(() => cleanup());

// Shared Vitest setup for component/interaction tests (jsdom environment).
// jsdom does not implement matchMedia; App.svelte reads it at module init
// time to track the OS theme preference, so every component test run needs
// a stand-in before any component mounts.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
