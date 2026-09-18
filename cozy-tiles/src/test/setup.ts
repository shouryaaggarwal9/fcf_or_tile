import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// Node-environment suites have no DOM; only component tests mount anything.
afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});

// jsdom ships no matchMedia, and the board reads it for reduced-motion before
// animating a flight.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
