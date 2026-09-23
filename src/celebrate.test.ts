// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetCelebration, spawnBurst } from "./celebrate";

// jsdom ships no Web Animations API, so the celebration layer would take its
// "collapse cleanly" path everywhere. These tests install a controllable stub.
function installFakeAnimate() {
  const calls: Array<{ finished: Promise<void> }> = [];
  const animate = vi.fn(() => {
    const entry = { finished: Promise.resolve() };
    calls.push(entry);
    return entry;
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    value: animate,
    configurable: true,
    writable: true,
  });
  return { animate, calls };
}

beforeEach(() => {
  document.getElementById("cozy-celebrate")?.remove();
  // Module state must not leak between tests: reset the finale throttle.
  resetCelebration();
  // jsdom's prototype genuinely lacks animate; drop any stub a test left.
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
  vi.restoreAllMocks();
});

function particles() {
  return document.getElementById("cozy-celebrate")?.children.length ?? 0;
}

describe("the celebration layer", () => {
  it("scatters match and finale bursts into a fixed host layer", () => {
    installFakeAnimate();
    spawnBurst({ x: 100, y: 100 }, "match", false);
    spawnBurst({ x: 200, y: 200 }, "finale", false);

    const layer = document.getElementById("cozy-celebrate");
    expect(layer).not.toBeNull();
    expect(layer!.style.pointerEvents).toBe("none");
    // The bursts share one host layer.
    expect(particles()).toBe(36); // 10 + 26
  });

  it("animates every particle and removes them as each finishes", async () => {
    const fake = installFakeAnimate();
    spawnBurst({ x: 0, y: 0 }, "match", false);

    expect(fake.animate).toHaveBeenCalledTimes(10);
    expect(particles()).toBe(10);

    await Promise.resolve();
    await Promise.resolve();
    expect(particles()).toBe(0);
  });

  it("does nothing under reduced motion", () => {
    const fake = installFakeAnimate();
    spawnBurst({ x: 50, y: 50 }, "match", true);
    spawnBurst({ x: 50, y: 50 }, "finale", true);
    expect(document.getElementById("cozy-celebrate")).toBeNull();
    expect(fake.animate).not.toHaveBeenCalled();
  });

  it("fires a finale once per tick so a double mount cannot stutter", () => {
    installFakeAnimate();
    spawnBurst({ x: 0, y: 0 }, "finale", false);
    const afterFirst = particles();
    expect(afterFirst).toBeGreaterThan(0);
    spawnBurst({ x: 0, y: 0 }, "finale", false);
    expect(particles()).toBe(afterFirst);
  });

  it("collapses cleanly where the Web Animations API is missing", () => {
    // No stub installed: exactly the environment celebrate.ts must tolerate.
    spawnBurst({ x: 0, y: 0 }, "match", false);
    expect(document.getElementById("cozy-celebrate")).not.toBeNull();
    expect(particles()).toBe(0);
  });
});
