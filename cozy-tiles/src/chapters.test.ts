import { describe, expect, it } from "vitest";
import { chapterName } from "./chapters";
import { chapterOf, MAX_LEVEL } from "./levels";

describe("chapter names", () => {
  it("is deterministic and unique across chapters", () => {
    expect(chapterName(1)).toBe("Meadow");
    expect(chapterName(1)).toBe(chapterName(1));
    expect(chapterName(2)).toBe("Orchard");
    expect(chapterName(13)).toBe("Meadow 2");
    expect(chapterName(25)).toBe("Meadow 3");

    const names = new Set(Array.from({ length: 60 }, (_, i) => chapterName(i + 1)));
    expect(names.size).toBe(60);
  });

  it("names every reachable chapter, including the last one", () => {
    const last = chapterOf(MAX_LEVEL);
    expect(chapterName(last)).toBeTruthy();
    expect(chapterName(last)).not.toBe(chapterName(1));
  });

  it("refuses nonsense chapter numbers", () => {
    for (const value of [0, -1, 1.5, NaN]) {
      expect(() => chapterName(value)).toThrow();
    }
  });
});
