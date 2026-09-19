// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { __pwaStub, __resetPwaStub, __setNeedRefresh } from "./test/pwaRegisterStub";
import { GENERATOR_VERSION } from "./levels";
import { SAVE_KEY } from "./progress";
import { newSession } from "./session";
import { saveSession } from "./sessionStorage";

type User = ReturnType<typeof userEvent.setup>;

// The level 1 witness: three suns, three leaves, three drops, three berries.
const WINNING_SEQUENCE = [
  "t0", "t1", "b0", // suns
  "t2", "t3", "b1", // leaves
  "b2", "b3", "b4", // drops
  "b5", "b6", "b7", // berries
];

// Picking two of each kind fills all six slots without a triple.
const LOSING_SEQUENCE = ["t0", "t1", "t2", "t3", "b2", "b4"];

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

// Settings is disabled while a move is in flight, so it doubles as a
// "the move fully resolved" signal for tests.
async function settle() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled(),
  );
}

async function tapTile(user: User, id: string) {
  await user.click(tile(id));
  await settle();
}

async function play(user: User, ids: string[]) {
  for (const id of ids) await tapTile(user, id);
}

describe("Cozy Tiles app", () => {
  it("renders the board, six empty slots, and the coin balance", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Level 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("100 coins")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 6: empty")).toBeInTheDocument();
    expect(screen.queryByLabelText("Slot 7: empty")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "12 tiles remaining. 0 of 6 tray slots used.",
    );
  });

  it("keeps covered tiles unselectable and explains a mis-tap", async () => {
    const user = userEvent.setup();
    render(<App />);

    const blocked = tile("b0");
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).toHaveAccessibleName("Sun, covered");

    await user.click(blocked);

    expect(tile("b0")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument();
    expect(tile("b0").className).toContain("denied");

    await tapTile(user, "t0");

    expect(tile("b0")).toHaveAttribute("aria-disabled", "false");
    expect(tile("b0")).toHaveAccessibleName("Sun, available");
    expect(screen.getByLabelText("Slot 1: Sun")).toBeInTheDocument();
  });

  it("clears three matching symbols from the tray", async () => {
    const user = userEvent.setup();
    render(<App />);

    await play(user, ["t0", "t1", "b0"]);

    await waitFor(() =>
      expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "9 tiles remaining. 0 of 6 tray slots used.",
    );
  });

  it("warns before the tray fills", async () => {
    const user = userEvent.setup();
    render(<App />);

    await play(user, ["t0", "t1", "t2", "t3", "b2"]);

    expect(screen.getByText(/one slot left/)).toBeInTheDocument();
  });

  it("highlights a provably safe pick when asked for a hint", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /^Hint/ }));

    await waitFor(() => expect(tile("t0").className).toContain("hinted"));
    expect(screen.getByRole("status")).toHaveTextContent(/safe pick/i);
  });

  it("charges coins to undo the last pick after confirmation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await tapTile(user, "t0");
    await user.click(screen.getByRole("button", { name: /^Undo/ }));

    expect(screen.getByRole("heading", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByText(/Costs 20 coins/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Spend 20" }));

    await waitFor(() =>
      expect(screen.getByLabelText("80 coins")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument();
    expect(tile("t0")).toBeInTheDocument();
  });

  it("closes a dialog with Escape and returns focus to its button", async () => {
    const user = userEvent.setup();
    render(<App />);

    await tapTile(user, "t0");
    const undoButton = screen.getByRole("button", { name: /^Undo/ });
    await user.click(undoButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(undoButton).toHaveFocus();
    expect(screen.getByLabelText("100 coins")).toBeInTheDocument();
  });

  it("confirms before restarting an attempt in progress", async () => {
    const user = userEvent.setup();
    render(<App />);

    await tapTile(user, "t0");
    await user.click(screen.getByRole("button", { name: "Restart level" }));
    expect(
      screen.getByRole("heading", { name: "Restart level?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Slot 1: Sun")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart level" }));
    await user.click(screen.getByRole("button", { name: "Restart" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "12 tiles remaining. 0 of 6 tray slots used.",
    );
  });

  it("offers a free rescue first when the tray fills", async () => {
    const user = userEvent.setup();
    render(<App />);

    await play(user, LOSING_SEQUENCE);

    expect(
      screen.getByRole("heading", { name: "Out of slots" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Free rescue — undo that pick" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Out of slots" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Slot 6: empty")).toBeInTheDocument();
    expect(screen.getByLabelText("100 coins")).toBeInTheDocument();
  });

  it("pays the reward once, rates the attempt, and advances", async () => {
    const user = userEvent.setup();
    render(<App />);

    await play(user, WINNING_SEQUENCE);

    expect(
      screen.getByRole("heading", { name: "Lovely matching!" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("3 of 3 stars")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("120 coins")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Next level" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Level 2" }),
      ).toBeInTheDocument(),
    );
  });

  it("rates an assisted win lower and remembers the best rating", async () => {
    const user = userEvent.setup();
    render(<App />);

    await tapTile(user, "t0");
    await user.click(screen.getByRole("button", { name: /^Undo/ }));
    await user.click(screen.getByRole("button", { name: "Spend 20" }));
    await play(user, WINNING_SEQUENCE);

    expect(screen.getByLabelText("2 of 3 stars")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Levels" }));
    expect(
      screen.getByRole("button", { name: "Level 1, completed, 2 of 3 stars" }),
    ).toBeInTheDocument();
  });

  it("locks the next level until the current one is cleared", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Levels" }));

    expect(
      screen.getByRole("button", { name: "Level 1, unlocked" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Level 2, locked" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await play(user, WINNING_SEQUENCE);
    await user.click(screen.getByRole("button", { name: "Levels" }));

    expect(
      screen.getByRole("button", { name: "Level 1, completed, 3 of 3 stars" }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Level 2, unlocked" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Level 2" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { name: "Lovely matching!" }),
    ).not.toBeInTheDocument();
  });

  it("pages the level map in named chapters without hiding progress", async () => {
    const user = userEvent.setup();
    saveSession(
      { ...newSession(45), rewardedThrough: 44, coins: 500 },
      window.localStorage,
    );
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Level 45" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Levels" }));

    expect(screen.getByText("Levels 41–60")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Level 41, completed" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Level 45, unlocked" }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("button", { name: "Level 46, locked" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Next levels" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous levels" }));

    expect(screen.getByText("Levels 21–40")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Level 40, completed" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Next levels" }),
    ).toBeEnabled();
  });

  it("adopts progress saved by another tab instead of overwriting it", async () => {
    render(<App />);

    const other = { ...newSession(3), coins: 250 };
    const raw = JSON.stringify({
      ...other,
      version: 3,
      generator: GENERATOR_VERSION,
    });
    window.localStorage.setItem(SAVE_KEY, raw);
    window.dispatchEvent(
      new StorageEvent("storage", { key: SAVE_KEY, newValue: raw }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Level 3" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("250 coins")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/another tab/i);
  });

  it("resets all progress after an explicit confirmation", async () => {
    const user = userEvent.setup();
    saveSession(
      { ...newSession(45), rewardedThrough: 44, coins: 900 },
      window.localStorage,
    );
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Erase everything" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Level 1" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("100 coins")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("stacks an opened dialog above the result screen", async () => {
    const user = userEvent.setup();
    render(<App />);

    await play(user, WINNING_SEQUENCE);
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const win = screen.getByRole("heading", { name: "Lovely matching!" });
    const settings = screen.getByRole("heading", { name: "Settings" });

    // The dialog must paint after the result overlay to sit on top of it.
    expect(
      win.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(4);
  });

  it("restores settings and progress from a previous visit", async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("checkbox", { name: "Sound effects" }));
    await user.click(screen.getByRole("checkbox", { name: "Relaxed Mode" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await tapTile(user, "t0");

    view.unmount();
    render(<App />);

    expect(screen.getByLabelText("Slot 1: Sun")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(
      screen.getByRole("checkbox", { name: "Sound effects" }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Vibration" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Relaxed Mode" }),
    ).toBeChecked();
  });

  it("skips the win dialog when auto-advance is on", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Auto-advance after a win" }),
    );
    await user.click(screen.getByRole("button", { name: "Close" }));

    await play(user, WINNING_SEQUENCE);

    expect(
      screen.queryByRole("heading", { name: "Lovely matching!" }),
    ).not.toBeInTheDocument();
    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", { name: "Level 2" }),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Level 1 cleared/);
  });

  it("keeps the win dialog when auto-advance is off", async () => {
    const user = userEvent.setup();
    render(<App />);

    await play(user, WINNING_SEQUENCE);

    expect(
      screen.getByRole("heading", { name: "Lovely matching!" }),
    ).toBeInTheDocument();
  });

  it("clamps the board to the height left on screen", () => {
    class FakeResizeObserver {
      callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }

      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const height = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(100);

    render(<App />);

    const board = document.querySelector<HTMLElement>(".board")!;
    const width = Number.parseFloat(board.style.maxWidth);
    // The level 1 board is 3.92 x 1.92 units: 100px of height allows ~204px.
    expect(width).toBeLessThan(3.92 * 88);
    expect(width).toBeCloseTo(204.2, 0);

    height.mockRestore();
    vi.unstubAllGlobals();
  });

  it("keeps the plain instruction on every level", () => {
    render(<App />);

    expect(
      screen.getByText("Only uncovered tiles can be picked."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Rainbow/)).not.toBeInTheDocument();
  });

  it("offers to install when the browser supports it", async () => {
    const user = userEvent.setup();
    const prompt = vi.fn(() => Promise.resolve());
    render(<App />);

    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);

    const install = await screen.findByRole("button", { name: "Install" });
    await user.click(install);

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("reassures the player while offline", async () => {
    render(<App />);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    window.dispatchEvent(new Event("offline"));

    await waitFor(() =>
      expect(screen.getByText(/Offline/)).toBeInTheDocument(),
    );

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    window.dispatchEvent(new Event("online"));

    await waitFor(() =>
      expect(screen.queryByText(/Offline/)).not.toBeInTheDocument(),
    );
  });

  it("offers a reload once a new version is waiting", async () => {
    const user = userEvent.setup();
    __setNeedRefresh(true);
    render(<App />);

    expect(
      screen.getByText("A new version of Cozy Tiles is ready."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(__pwaStub().updates).toBe(1);
    expect(screen.queryByText(/new version/)).not.toBeInTheDocument();
  });

  it("lets the player postpone an update", async () => {
    const user = userEvent.setup();
    __setNeedRefresh(true);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Later" }));

    expect(screen.queryByText(/new version/)).not.toBeInTheDocument();
    expect(__pwaStub().updates).toBe(0);
    // The game stays playable on the old version.
    await tapTile(user, "t0");
    expect(screen.getByLabelText("Slot 1: Sun")).toBeInTheDocument();
  });

  it("stays quiet while the app is current", () => {
    render(<App />);

    expect(screen.queryByText(/new version/)).not.toBeInTheDocument();
    expect(__pwaStub()).toEqual({ needRefresh: false, updates: 0 });
  });
});
