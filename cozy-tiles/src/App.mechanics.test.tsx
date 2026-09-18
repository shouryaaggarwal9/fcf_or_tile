// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { __resetPwaStub } from "./test/pwaRegisterStub";
import { frozenCount, isSelectable, planMove } from "./game";
import { frozenFor, generateLevel } from "./levels";
import { newSession, pick } from "./session";
import { saveSession } from "./sessionStorage";
import { LABELS } from "./symbols";

beforeEach(() => {
  window.localStorage.clear();
  __resetPwaStub();
});

function tile(id: string) {
  const element = document.querySelector<HTMLButtonElement>(
    `[data-tile-id="${id}"]`,
  );
  if (!element) throw new Error(`Tile ${id} is not on the board`);
  return element;
}

async function settle() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled(),
  );
}

// Plays into a frozen level only as far as the first selectable frozen tile,
// because the generator may place frost on a covered tile.
function intoFrost(level: number) {
  let session = newSession(level);
  for (const id of generateLevel(level).solution) {
    const frozen = session.game.board.find(
      (t) => frozenCount(t) > 0 && isSelectable(session.game, t.id),
    );
    if (frozen) return { session, id: frozen.id };
    const picked = pick(session, id);
    if (!picked) break;
    session = picked.session;
  }
  throw new Error("No frozen tile became selectable");
}

describe("frozen tiles in the app", () => {
  it("renders frost, explains it, and thaws with one tap", async () => {
    const user = userEvent.setup();
    const { session, id } = intoFrost(11);
    saveSession(session, window.localStorage);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 11" })).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Frozen tiles thaw with one tap/),
    ).toBeInTheDocument();
    const before = document.querySelectorAll(".board-tile.frozen").length;
    expect(before).toBeGreaterThan(0);

    const node = tile(id);
    expect(node).toHaveClass("frozen");
    expect(node).toHaveAccessibleName(/frozen/);
    expect(node).toHaveAttribute("aria-disabled", "false");

    await user.click(node);
    await settle();

    // The tile stays on the board, its frost is gone, and nothing reached the tray.
    expect(tile(id)).toBeInTheDocument();
    expect(tile(id)).not.toHaveClass("frozen");
    expect(document.querySelectorAll(".board-tile.frozen")).toHaveLength(before - 1);
    expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/tiles remaining/);
  });

  it("schedules frost on the intended levels", () => {
    expect(frozenFor(11)).toBeGreaterThan(0);
    expect(generateLevel(11).game.board.filter((t) => frozenCount(t) > 0)).toHaveLength(
      frozenFor(11),
    );
  });
});

describe("the permanent seventh slot", () => {
  it("is bought once, opens every attempt, and is never offered again", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    expect(screen.getByLabelText("Slot 6: empty")).toBeInTheDocument();
    expect(screen.queryByLabelText("Slot 7: empty")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /\+ Slot/ }));
    await user.click(screen.getByRole("button", { name: "Spend 40" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Slot 7: empty")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /\+ Slot/ })).not.toBeInTheDocument();

    // Still open after a reload, and still not offered again.
    view.unmount();
    render(<App />);
    expect(screen.getByLabelText("Slot 7: empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ Slot/ })).not.toBeInTheDocument();
  });
});

// Plays real level-16 moves until a rainbow sits in the tray beside a lone sun.
// Clearing the sun with that rainbow would leave four suns that can never match,
// so it is exactly the spot the fairness guard exists to refuse.
const STRANDING_LINE = ["l3-0", "l3-3", "l3-4", "l3-5", "l3-1"];

function intoStrandingSpot() {
  const game = STRANDING_LINE.reduce(
    (state, id) => planMove(state, id)!.result,
    generateLevel(16).game,
  );
  return { ...newSession(16), rewardedThrough: 15, game };
}

// The same line plus the raw pick that the guard now refuses, with the matching
// undo history — a save written by a build that predates the guard.
function strandedSave() {
  const undo = [];
  let game = generateLevel(16).game;
  for (const id of [...STRANDING_LINE, "l3-2"]) {
    undo.push(game);
    game = planMove(game, id)!.result;
  }
  return { ...newSession(16), rewardedThrough: 15, undo, game };
}

describe("the rainbow fairness guard in the app", () => {
  it("refuses the pick that would strand the level, and still lets the player dig", async () => {
    const user = userEvent.setup();
    saveSession(intoStrandingSpot(), window.localStorage);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 16" })).toBeInTheDocument(),
    );
    // The sun looks like an easy triple with a rainbow in hand, but clearing it
    // would leave four suns that could never match again.
    expect(tile("l3-2")).toHaveAttribute("aria-disabled", "true");
    expect(tile("l3-2")).toHaveAccessibleName(/would leave no way to finish/);

    await user.click(tile("l3-2"));
    expect(screen.getByRole("status")).toHaveTextContent(/no way to finish/i);
    // Nothing moved: the tray still holds the rainbow and the sun.
    expect(screen.getByLabelText("Slot 1: Rainbow")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 2: Sun")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 3: empty")).toBeInTheDocument();

    // Uncovering a tile is always allowed, so the refusal is never a dead end.
    expect(tile("l2-3")).toHaveAttribute("aria-disabled", "false");
    await user.click(tile("l2-3"));
    await settle();
    expect(screen.getByRole("status")).toHaveTextContent(/tiles remaining/);
    expect(screen.getByLabelText("Slot 3: Fish")).toBeInTheDocument();
  });

  it("rewinds an already-stranded save and says so", async () => {
    const save = strandedSave();
    expect(save.game.status).toBe("playing");
    saveSession(save, window.localStorage);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 16" })).toBeInTheDocument(),
    );
    // The attempt was rewound to its last playable pick rather than thrown away.
    expect(screen.getByRole("status")).toHaveTextContent(/rewound to your last playable pick/i);
    expect(screen.getByLabelText("Slot 1: Rainbow")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 2: Sun")).toBeInTheDocument();
    expect(tile("l3-2")).toHaveAttribute("aria-disabled", "true");
  });
});

describe("objectives in the app", () => {
  it("shows a collect goal", async () => {
    saveSession({ ...newSession(15), rewardedThrough: 14 }, window.localStorage);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 15" })).toBeInTheDocument(),
    );
    const goal = generateLevel(15).game.goal!;
    const line = document.querySelector(".goal-line")!;
    expect(line).toHaveTextContent(/Collect .* more/);
    expect(line).toHaveTextContent(LABELS[goal.target]);
  });

  it("shows the remaining picks on a pick-limited level", async () => {
    saveSession({ ...newSession(20), rewardedThrough: 19 }, window.localStorage);
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 20" })).toBeInTheDocument(),
    );
    const limit = generateLevel(20).game.limit!;
    const line = document.querySelector(".goal-line")!;
    expect(line).toHaveTextContent(`${limit.limit} moves left`);
  });

  it("explains a loss by pick limit", async () => {
    const base = newSession(20);
    const limit = base.game.limit!;
    saveSession(
      {
        ...base,
        rewardedThrough: 19,
        game: { ...base.game, status: "lost", limit: { limit: limit.limit, used: limit.limit } },
      },
      window.localStorage,
    );
    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Out of moves" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/picks ran out/)).toBeInTheDocument();
  });
});
