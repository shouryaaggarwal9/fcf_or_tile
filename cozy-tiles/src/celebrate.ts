// Particle bursts for the celebration layer. This lives outside React, and
// never blocks or changes game rules — like the tile-flight ghost, it is pure
// feedback. No dependencies: particles are absolutely-positioned spans driven
// by the Web Animations API and remove themselves when finished.
export type BurstPoint = { x: number; y: number };

export type BurstKind = "match" | "finale";

const LAYER_ID = "cozy-celebrate";

// The game's own warm palette so bursts never look bolted on.
const COLORS = ["#ffd27d", "#ffdf85", "#fff9ee", "#f4bd82", "#d7aef2", "#9ad6c8"];

const BURSTS: Record<BurstKind, { count: number; distance: [number, number]; duration: [number, number] }> = {
  // A triple clear: a small pop around the tray slot or matched tile.
  match: { count: 10, distance: [26, 56], duration: [360, 520] },
  // A won board: a wide shower behind the result card.
  finale: { count: 26, distance: [40, 110], duration: [620, 900] },
};

// Where banked coins land: the balance chip in the top bar.
const COIN_CHIP_SELECTOR = ".coin-chip";

function layer(): HTMLElement {
  const existing = document.getElementById(LAYER_ID);
  if (existing) return existing;
  const host = document.createElement("div");
  host.id = LAYER_ID;
  Object.assign(host.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: "1200",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(host);
  return host;
}

// StrictMode mounts effects twice in development; a double finale reads as a
// stutter, so a second call within a tick is ignored.
let lastFinaleAt = 0;

/** Test isolation: clears the finale throttle and any cached layer. */
export function resetCelebration(): void {
  lastFinaleAt = 0;
}

/**
 * Scatters a short burst of particles from a viewport point. Honors
 * reduced-motion by doing nothing, and degrades silently where the Web
 * Animations API is unavailable.
 */
export function spawnBurst(point: BurstPoint, kind: BurstKind, reducedMotion: boolean): void {
  if (reducedMotion || typeof document === "undefined") return;
  if (kind === "finale") {
    const now = Date.now();
    if (now - lastFinaleAt < 80) return;
    lastFinaleAt = now;
  }

  const spec = BURSTS[kind];
  const host = layer();

  for (let index = 0; index < spec.count; index++) {
    const particle = document.createElement("span");
    const size = 5 + Math.random() * 4;
    const angle = Math.random() * Math.PI * 2;
    const distance = spec.distance[0] +
      Math.random() * (spec.distance[1] - spec.distance[0]);
    const duration = spec.duration[0] +
      Math.random() * (spec.duration[1] - spec.duration[0]);

    Object.assign(particle.style, {
      position: "absolute",
      left: `${point.x}px`,
      top: `${point.y}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: index % 2 ? "50%" : "2px",
      background: COLORS[index % COLORS.length],
    } satisfies Partial<CSSStyleDeclaration>);
    host.appendChild(particle);

    // jsdom and older engines ship no Element.animate; skip cleanly rather
    // than leaving stray dots on screen.
    if (typeof particle.animate !== "function") {
      particle.remove();
      return;
    }

    const animation = particle.animate(
      [
        { transform: "translate(-50%, -50%) translate(0, 0) scale(1)", opacity: 1 },
        {
          transform: `translate(-50%, -50%) translate(${Math.cos(angle) * distance}px, ${
            Math.sin(angle) * distance
          }px) scale(0.4)`,
          opacity: 0,
        },
      ],
      { duration, easing: "cubic-bezier(.17,.67,.35,1)", fill: "forwards" },
    );
    animation.finished
      .catch(() => {})
      .finally(() => particle.remove());
  }
}

/**
 * Flies a handful of banked coins from a viewport point to the coin chip.
 * Fires right after a banked win so the reward visibly travels into the
 * balance. Honors reduced motion; skips silently when the chip is missing or
 * the Web Animations API is unavailable (jsdom, older engines).
 */
export function flyCoins(from: BurstPoint, count: number, reducedMotion: boolean): void {
  if (reducedMotion || typeof document === "undefined") return;
  const chip = document.querySelector(COIN_CHIP_SELECTOR);
  if (!(chip instanceof HTMLElement)) return;
  if (typeof document.createElement("span").animate !== "function") return;

  const to = chip.getBoundingClientRect();
  const targetX = to.left + to.width / 2;
  const targetY = to.top + to.height / 2;
  const host = layer();

  for (let index = 0; index < count; index++) {
    const coin = document.createElement("span");
    const size = 10 + Math.random() * 4;
    const start = {
      x: from.x + (Math.random() - 0.5) * 90,
      y: from.y + (Math.random() - 0.5) * 40,
    };

    Object.assign(coin.style, {
      position: "absolute",
      left: `${start.x}px`,
      top: `${start.y}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      background: "#ffdf85",
      border: "1.5px solid #af7020",
      boxShadow: "inset 0 -2px 0 #f4bd82",
    } satisfies Partial<CSSStyleDeclaration>);
    host.appendChild(coin);

    // A shallow arc: rise a little, then dive into the chip.
    const midX = (start.x + targetX) / 2;
    const midY = Math.min(start.y, targetY) - 40 - Math.random() * 30;
    const animation = coin.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        {
          transform: `translate(calc(${midX - start.x}px - 50%), calc(${midY - start.y}px - 50%)) scale(0.9)`,
          opacity: 1,
        },
        {
          transform: `translate(calc(${targetX - start.x}px - 50%), calc(${targetY - start.y}px - 50%)) scale(0.5)`,
          opacity: 0.9,
        },
      ],
      {
        duration: 520 + index * 70,
        delay: index * 80,
        easing: "ease-in-out",
        fill: "backwards",
      },
    );
    animation.finished
      .catch(() => {})
      .finally(() => coin.remove());
  }
}
