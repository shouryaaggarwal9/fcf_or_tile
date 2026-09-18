import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { scheduleUpdateChecks } from "../pwa";
import { UpdatePrompt } from "./UpdatePrompt";

// Owns the service worker handshake: waits for the new worker, then lets the
// player swap it in. Nothing renders until an update is actually waiting.
export function PwaUpdate() {
  const stopChecks = useRef<(() => void) | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) stopChecks.current = scheduleUpdateChecks(registration);
    },
  });

  useEffect(
    () => () => {
      stopChecks.current?.();
    },
    [],
  );

  if (!needRefresh) return null;

  return (
    <UpdatePrompt
      onRefresh={() => {
        void updateServiceWorker(true);
      }}
      onDismiss={() => setNeedRefresh(false)}
    />
  );
}
