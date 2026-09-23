// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { __resetPwaStub } from "./test/pwaRegisterStub";
import { newSession, pick } from "./session";
import { saveSession } from "./sessionStorage";

type User = ReturnType<typeof userEvent.setup>;

// The level 1 witness, in the canonical order used by App.test.tsx.
const WINNING_SEQUENCE = [
  "t0", "t1", "b0", // suns
  "t2", "t3", "b1", // leaves
  "b2", "b3", "b4", // drops
  "b5", "b6", "b7", // berries
];

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

describe("the celebration layer", () => {
  // Fluent play stages the next pair BEFORE completing the current triple,
  // so a genuine back-to-back has at most one idle pick between clears.
  it("shows the combo chip on back-to-back clears", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Stage the leaf pair, then finish the suns, then close the leaves.
    await tapTile(user, "t2");
    await tapTile(user, "t3");
    await tapTile(user, "t0");
    await tapTile(user, "t1");
    await tapTile(user, "b0"); // suns clear — chain of one, no chip yet
    expect(screen.queryByText("Combo")).not.toBeInTheDocument();

    await tapTile(user, "b1"); // leaves clear back-to-back

    const chip = screen.getByText("Combo").closest(".combo-chip")!;
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("×2");
  });

  it("breaks the chain after two idle picks", async () => {
    const user = userEvent.setup();
    render(<App />);

    await tapTile(user, "t2");
    await tapTile(user, "t3");
    await tapTile(user, "t0");
    await tapTile(user, "t1");
    await tapTile(user, "b0"); // suns — chain 1
    await tapTile(user, "b1"); // leaves — chain 2, chip up
    expect(screen.getByText("Combo")).toBeInTheDocument();

    await tapTile(user, "b2"); // idle pick 1 — chain survives
    expect(screen.getByText("Combo")).toBeInTheDocument();
    await tapTile(user, "b3"); // idle pick 2 — chain breaks
    expect(screen.queryByText("Combo")).not.toBeInTheDocument();
  });

  it("pops the win stars in and pulses the coin chip after advancing", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const id of WINNING_SEQUENCE) await tapTile(user, id);

    expect(
      screen.getByRole("heading", { name: "Lovely matching!" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("3 of 3 stars")).toBeInTheDocument();
    expect(document.querySelectorAll(".star-earned")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Next level" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 2" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("120 coins")).toBeInTheDocument();
    expect(document.querySelector(".coin-chip-pulse")).not.toBeNull();
  });

  it("tells the truth about a replayed level's coins", async () => {
    // A genuinely won level 1 session, exactly as the game banks it.
    let won = newSession(1);
    for (const id of WINNING_SEQUENCE) won = pick(won, id)!.session;
    expect(won.game.status).toBe("won");
    saveSession(won, window.localStorage);
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Lovely matching!" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A replay — coins stay banked from your first clear/),
    ).toBeInTheDocument();
  });
});
