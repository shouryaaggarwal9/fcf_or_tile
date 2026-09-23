import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "cozy-tiles.install-dismissed";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Without storage we cannot remember the choice, so stay quiet.
    return true;
  }
}

// Two small, dismissible affordances: an install offer where the browser
// supports one (plus instructions on iOS, which never fires the event), and a
// reminder that play continues offline with progress saved locally.
export function StatusChips() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installed, setInstalled] = useState(isStandalone);
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* remembering the choice is optional */
    }
  }

  const offerInstall = !dismissed && !installed && (prompt !== null || isIos());
  if (!offline && !offerInstall) return null;

  return (
    <div className="status-chips">
      {offline && (
        <p className="status-chip status-chip-offline" role="status">
          Offline — progress is saved on this device.
        </p>
      )}

      {offerInstall && (
        <div className="status-chip status-chip-install">
          <p>
            {prompt
              ? "Install Cozy Tiles for full-screen, offline play."
              : "To install: tap Share, then Add to Home Screen."}
          </p>
          <div className="update-actions">
            {prompt && (
              <button
                className="primary-button"
                onClick={() => {
                  void prompt.prompt();
                  dismiss();
                }}
              >
                Install
              </button>
            )}
            <button className="quiet-button" onClick={dismiss}>
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
