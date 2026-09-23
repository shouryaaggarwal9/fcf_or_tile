import { describe, expect, it } from "vitest";
import { FeedbackKit } from "./feedback";

describe("feedback kit", () => {
  it("vibrates accepted events only when enabled", () => {
    const calls: Array<number | number[]> = [];
    const kit = new FeedbackKit(true, true, (pattern) => { calls.push(pattern); return true; });
    kit.pick();
    kit.match();
    expect(calls).toEqual([[12], [18, 40, 18]]);
  });

  it("climbs the combo arpeggio with the chain and caps it", () => {
    const calls: Array<number | number[]> = [];
    const kit = new FeedbackKit(true, true, (pattern) => { calls.push(pattern); return true; });
    kit.combo(2);
    kit.combo(9);
    expect(calls).toEqual([[14, 36, 14], [14, 36, 14]]);
  });

  it("chimes each star arrival", () => {
    const calls: Array<number | number[]> = [];
    const kit = new FeedbackKit(true, true, (pattern) => { calls.push(pattern); return true; });
    kit.stars();
    expect(calls).toEqual([[12, 36, 12]]);
  });

  it("skips vibration when disabled and survives a failing API", () => {
    const calls: Array<number | number[]> = [];
    const off = new FeedbackKit(true, false, (pattern) => { calls.push(pattern); return true; });
    off.win();
    off.fail();
    expect(calls).toHaveLength(0);
    const broken = new FeedbackKit(true, true, () => { throw new Error("denied"); });
    expect(() => broken.pick()).not.toThrow();
  });

  it("stays silent when muted and never throws without a browser audio context", () => {
    const kit = new FeedbackKit(true, false, () => true);
    expect(() => {
      kit.pick(); kit.match(); kit.booster(); kit.slot(); kit.fail(); kit.win(); kit.silence();
    }).not.toThrow();
  });

  it("configures mute and vibration from settings", () => {
    const kit = new FeedbackKit(false, true, () => true);
    kit.configure({ sound: false, vibration: false });
    expect(kit.muted).toBe(true);
    expect(kit.vibration).toBe(false);
    kit.configure({ sound: true, vibration: true });
    expect(kit.muted).toBe(false);
  });
});

