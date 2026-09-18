// A tile flying out of the board and into its tray slot. This lives outside
// React, and never blocks or changes game rules.
export const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export async function animateFlight(
  source: HTMLElement,
  destination: HTMLElement,
  reducedMotion: boolean,
) {
  if (reducedMotion) return;

  const from = source.getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLButtonElement;

  ghost.setAttribute("aria-hidden", "true");
  ghost.removeAttribute("id");
  ghost.tabIndex = -1;
  ghost.disabled = true;

  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: "0",
    zIndex: "1000",
    pointerEvents: "none",
    transformOrigin: "top left",
    opacity: "1",
    filter: "none",
    animation: "none",
  });

  document.body.appendChild(ghost);

  try {
    const animation = ghost.animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${to.left - from.left}px, ${
            to.top - from.top
          }px) scale(${to.width / from.width}, ${to.height / from.height})`,
        },
      ],
      {
        duration: 190,
        easing: "cubic-bezier(.2,.7,.25,1)",
        fill: "forwards",
      },
    );

    await animation.finished;
  } finally {
    ghost.remove();
  }
}
