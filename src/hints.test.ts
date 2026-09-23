import { describe, expect, it } from "vitest";
import { hintFor } from "./hints";
import { isSelectable, planMove } from "./game";
import { generateLevel } from "./levels";

describe("hints", () => {
  it("is silent once the level is finished", () => {
    let game = generateLevel(1).game;
    for (const id of generateLevel(1).solution) game = planMove(game, id)!.result;

    expect(hintFor(game, 1)).toBeNull();
  });

  it("only calls a hint safe when following it finishes the level", () => {
    let game = generateLevel(4).game;
    const witness = generateLevel(4).solution;

    for (let step = 0; step < witness.length; step++) {
      const hint = hintFor(game, 4);
      expect(hint).not.toBeNull();
      expect(hint!.safe).toBe(true);
      expect(isSelectable(game, hint!.id)).toBe(true);
      game = planMove(game, hint!.id)!.result;
    }

    expect(game.status).toBe("won");
  });

  it("stays safe through a whole mid-game level", () => {
    let game = generateLevel(16).game;
    expect(hintFor(game, 16)!.safe).toBe(true);

    for (let step = 0; step < 200 && game.status === "playing"; step++) {
      const hint = hintFor(game, 16);
      expect(hint).not.toBeNull();
      expect(isSelectable(game, hint!.id)).toBe(true);
      game = planMove(game, hint!.id)!.result;
    }

    expect(game.status).toBe("won");
  });

  it("never suggests a locked tile on a lock-bearing level", () => {
    const level = 31;
    const generated = generateLevel(level);
    expect(generated.game.board.some((tile) => tile.lockedBy?.length)).toBe(true);
    let game = generated.game;

    for (let step = 0; step < 300 && game.status === "playing"; step++) {
      const hint = hintFor(game, level);
      if (!hint) break;
      expect(isSelectable(game, hint.id)).toBe(true);
      game = planMove(game, hint.id)!.result;
    }

    expect(game.status).toBe("won");
  });

  it("never suggests a tile that cannot be picked", () => {
    // Take a witness tile out of order so the witness no longer applies.
    let game = generateLevel(4).game;
    const witness = generateLevel(4).solution;
    const deviate = witness[2];
    if (isSelectable(game, deviate)) game = planMove(game, deviate)!.result;

    for (let step = 0; step < witness.length && game.status === "playing"; step++) {
      const hint = hintFor(game, 4);
      if (!hint) break;
      expect(isSelectable(game, hint.id)).toBe(true);
      game = planMove(game, hint.id)!.result;
    }
  });
});
