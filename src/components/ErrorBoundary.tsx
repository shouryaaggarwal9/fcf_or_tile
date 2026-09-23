import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { feedback } from "../feedback";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { failed: boolean };

// Without this, one render error leaves an installed offline app on a blank
// screen with no way back. Progress is already saved before every move, so the
// only safe recovery is a reload.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    feedback.silence();
    console.error("Cozy Tiles failed to render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="game-shell">
        <section className="result-overlay">
          <section className="result-card">
            <div className="result-symbol" aria-hidden="true">
              ⚠
            </div>
            <h2>Something went wrong</h2>
            <p>
              Your progress is saved on this device. Reloading restores the last
              completed move.
            </p>
            <button
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </section>
        </section>
      </main>
    );
  }
}
