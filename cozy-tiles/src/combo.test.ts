import { describe, expect, it } from "vitest";
import { ComboCounter } from "./combo";

describe("the combo counter", () => {
  it("counts consecutive clears", () => {
    const combo = new ComboCounter();
    expect(combo.onMatch()).toBe(1);
    expect(combo.onMatch()).toBe(2);
    expect(combo.onMatch()).toBe(3);
    expect(combo.streak).toBe(3);
  });

  it("survives one idle pick but breaks after two in a row", () => {
    const combo = new ComboCounter();
    combo.onMatch();
    expect(combo.onPick()).toBe(false);
    expect(combo.onPick()).toBe(true);
    expect(combo.streak).toBe(0);
  });

  it("keeps the chain alive when clears alternate with single picks", () => {
    const combo = new ComboCounter();
    combo.onMatch();
    combo.onPick();
    expect(combo.onMatch()).toBe(2);
  });

  it("ignores idle picks while no chain is live", () => {
    const combo = new ComboCounter();
    expect(combo.onPick()).toBe(false);
    expect(combo.onPick()).toBe(false);
    expect(combo.onMatch()).toBe(1);
  });

  it("starts fresh after a reset", () => {
    const combo = new ComboCounter();
    combo.onMatch();
    combo.onMatch();
    combo.reset();
    expect(combo.streak).toBe(0);
    expect(combo.onMatch()).toBe(1);
  });
});
