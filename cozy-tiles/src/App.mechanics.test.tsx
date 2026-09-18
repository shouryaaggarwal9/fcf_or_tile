// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { __resetPwaStub } from "./test/pwaRegisterStub";
import { frozenCount, isSelectable } from "./game";
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
