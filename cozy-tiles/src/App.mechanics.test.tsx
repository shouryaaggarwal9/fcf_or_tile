// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { __resetPwaStub } from "./test/pwaRegisterStub";
import { generateLevel } from "./levels";
import { newSession } from "./session";
import { saveSession } from "./sessionStorage";
import { LABELS } from "./symbols";

beforeEach(() => {
  window.localStorage.clear();
  __resetPwaStub();
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
