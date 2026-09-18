import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type ModalProps = {
  titleId: string;
  /** Provided only for dismissible dialogs; Escape then closes them. */
  onClose?: () => void;
  children: ReactNode;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

// Every overlay shares this shell so keyboard and screen reader users get the
// same behaviour everywhere: a labelled dialog, Escape to dismiss when the
// dialog is dismissible, focus trapped inside, and focus returned afterwards.
export function Modal({ titleId, onClose, children }: ModalProps) {
  const overlay = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = overlay.current;
    if (!node) return;
    const restoreTo = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element.tabIndex >= -1,
      );

    const initial =
      node.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0];
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !node.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !node.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Focus must never be left on a detached node.
      if (restoreTo?.isConnected) restoreTo.focus();
    };
  }, [onClose]);

  return (
    <div
      className="result-overlay"
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <section className="result-card">{children}</section>
    </div>
  );
}
