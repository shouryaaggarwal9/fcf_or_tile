// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleUpdateChecks, UPDATE_CHECK_INTERVAL } from "./pwa";

function registrationStub() {
  const update = vi.fn(() => Promise.resolve());
  return { registration: { update } as unknown as ServiceWorkerRegistration, update };
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
}

function becomeVisible() {
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("service worker update checks", () => {
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("polls on an interval until stopped", async () => {
    vi.useFakeTimers();
    const { registration, update } = registrationStub();

    const stop = scheduleUpdateChecks(registration);
    expect(update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);
    expect(update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);
    expect(update).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL * 2);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("checks when a backgrounded app becomes visible again", () => {
    setVisibility("hidden");
    const { registration, update } = registrationStub();

    const stop = scheduleUpdateChecks(registration);
    becomeVisible();
    expect(update).not.toHaveBeenCalled();

    setVisibility("visible");
    becomeVisible();
    expect(update).toHaveBeenCalledTimes(1);

    stop();
    becomeVisible();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("ignores a failed check", async () => {
    vi.useFakeTimers();
    const registration = {
      update: vi.fn(() => Promise.reject(new Error("offline"))),
    } as unknown as ServiceWorkerRegistration;

    const stop = scheduleUpdateChecks(registration);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);

    expect(registration.update).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores a registration that throws at the call site", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const registration = {
      update: () => {
        calls += 1;
        throw new Error("not registered");
      },
    } as unknown as ServiceWorkerRegistration;

    const stop = scheduleUpdateChecks(registration);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL);

    expect(calls).toBe(1);
    stop();
  });
});
