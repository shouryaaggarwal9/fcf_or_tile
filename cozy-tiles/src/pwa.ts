// Browsers only look for a new service worker when the page is navigated to,
// and an installed game can run for days without a navigation. Poll on a timer
// and whenever a backgrounded app returns to the foreground instead, so a
// waiting update is noticed without a manual reload.
export const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

export function scheduleUpdateChecks(registration: ServiceWorkerRegistration) {
  const check = () => {
    try {
      // A failed check means offline or a network hiccup; nothing to report.
      void registration.update().catch(() => {});
    } catch {
      /* A broken registration must never interrupt play. */
    }
  };

  const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL);

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") check();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
