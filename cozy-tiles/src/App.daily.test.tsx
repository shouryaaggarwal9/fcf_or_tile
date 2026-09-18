// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { __resetPwaStub } from "./test/pwaRegisterStub";
import { dailyDateOf, puzzleFor } from "./daily";
import { newSession, pick, startDaily } from "./session";
import type { Session } from "./session";
import { saveSession } from "./sessionStorage";

beforeEach(() => {
  window.localStorage.clear();
  __resetPwaStub();
});

function winDaily(session: Session): Session {
  return puzzleFor(session.daily!).solution.reduce((current, id) => {
    const picked = pick(current, id);
    if (!picked) throw new Error(`Illegal daily move: ${id}`);
    return picked.session;
  }, session);
}

async function seedCompletedDaily() {
  saveSession(winDaily(startDaily(newSession(1), dailyDateOf())), window.localStorage);
  render(<App />);
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Daily complete!" }),
    ).toBeInTheDocument(),
  );
}

describe("daily puzzle app flow", () => {
  it("opens the daily dialog and starts today's puzzle", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Daily" }));
    expect(
      screen.getByRole("heading", { name: "Daily puzzle" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play today's puzzle" }));

    // The top bar now titles the daily, and the board is a fresh daily.
    expect(
      screen.getByRole("heading", { name: "Daily puzzle" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/tiles remaining/);

    // Leaving through the level map returns to the campaign.
    await user.click(screen.getByRole("button", { name: "Levels" }));
    await user.click(screen.getByRole("button", { name: "Level 1, unlocked" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 1" })).toBeInTheDocument(),
    );
  });

  it("celebrates a completed daily and returns the campaign attempt", async () => {
    const user = userEvent.setup();
    await seedCompletedDaily();

    expect(screen.getByText(/A 1-day streak/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to level 1" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 1" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("130 coins")).toBeInTheDocument();
    expect(screen.getByLabelText("1-day daily streak")).toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1: empty")).toBeInTheDocument();
  });

  it("does not unlock the next campaign level for a cleared daily", async () => {
    const user = userEvent.setup();
    await seedCompletedDaily();

    await user.click(screen.getByRole("button", { name: "Back to level 1" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 1" })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Levels" }));

    expect(
      screen.getByRole("button", { name: "Level 1, unlocked" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Level 2, locked" }),
    ).toBeDisabled();
  });

  it("reports stats and unlocks the daily achievement", async () => {
    const user = userEvent.setup();
    await seedCompletedDaily();

    await user.click(screen.getByRole("button", { name: "Back to level 1" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Stats & achievements" }));

    expect(
      screen.getByRole("heading", { name: "Stats & achievements" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Daily visitor: earned")).toBeInTheDocument();
    expect(screen.getByLabelText("First steps: not earned")).toBeInTheDocument();
    expect(screen.getByText("Dailies cleared")).toBeInTheDocument();
  });

  it("marks today's daily as already done", async () => {
    const user = userEvent.setup();
    await seedCompletedDaily();

    await user.click(screen.getByRole("button", { name: "Back to level 1" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Level 1" })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Daily" }));

    expect(
      screen.getByText(/already cleared today's puzzle/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replay today's puzzle" }),
    ).toBeInTheDocument();
  });
});
