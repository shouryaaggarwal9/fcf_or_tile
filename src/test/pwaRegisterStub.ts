// Test double for `virtual:pwa-register/react`. `vite.config.ts` aliases the
// virtual module here while running tests, so component tests can drive the
// update flow without a real service worker.
import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RegisterSWOptions } from "vite-plugin-pwa/types";

const state = { needRefresh: false, updates: 0 };
const listeners = new Set<(value: boolean) => void>();

function publish(value: boolean) {
  state.needRefresh = value;
  listeners.forEach((listener) => listener(value));
}

/** Reports a waiting update, as the browser would after a new deploy. */
export function __setNeedRefresh(value: boolean) {
  publish(value);
}

export function __resetPwaStub() {
  state.updates = 0;
  publish(false);
}

export function __pwaStub() {
  return { ...state };
}

export function useRegisterSW(options?: RegisterSWOptions) {
  const [needRefresh, setNeedRefresh] = useState(state.needRefresh);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const listener = (value: boolean) => setNeedRefresh(value);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    // Deliberately inert: scheduleUpdateChecks has its own unit tests, and
    // starting a real interval here would leak timers into unrelated tests.
    void options;
  }, [options]);

  const updateServiceWorker = useCallback(async () => {
    state.updates += 1;
    publish(false);
  }, []);

  return {
    needRefresh: [needRefresh, setNeedRefresh] as [
      boolean,
      Dispatch<SetStateAction<boolean>>,
    ],
    offlineReady: [offlineReady, setOfflineReady] as [
      boolean,
      Dispatch<SetStateAction<boolean>>,
    ],
    updateServiceWorker,
  };
}
