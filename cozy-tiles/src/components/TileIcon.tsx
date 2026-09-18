import type { TileKind } from "../game";
import { EXTRA_SYMBOLS } from "../symbols";

// Simple original SVG symbols.
// Unlike emoji, these look the same across devices.
export function TileIcon({ kind }: { kind: TileKind }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      {EXTRA_SYMBOLS[kind] && (
        <path
          d={EXTRA_SYMBOLS[kind].path}
          fill={EXTRA_SYMBOLS[kind].color}
          stroke="#35465b"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {kind === "sun" && (
        <g stroke="#a95f0b" strokeWidth="3" strokeLinecap="round">
          <path d="M32 5v7M32 52v7M5 32h7M52 32h7M13 13l5 5M46 46l5 5M13 51l5-5M46 18l5-5" />
          <circle cx="32" cy="32" r="15" fill="#ffc847" />
          <path d="M24 25c2-3 5-4 8-4" stroke="#fff3bd" />
        </g>
      )}

      {kind === "leaf" && (
        <g stroke="#28643a" strokeWidth="3" strokeLinecap="round">
          <path d="M13 43C8 23 28 10 52 12c2 25-13 43-32 35Z" fill="#79cc62" />
          <path d="M12 54 43 23M25 41V29M33 33h10" />
        </g>
      )}

      {kind === "drop" && (
        <g stroke="#08769a" strokeWidth="3" strokeLinecap="round">
          <path
            d="M32 7C25 19 13 30 13 40a19 19 0 0 0 38 0C51 30 39 19 32 7Z"
            fill="#40c6ed"
          />
          <path d="M23 33c-3 4-4 8-2 12" stroke="#e0faff" />
        </g>
      )}

      {kind === "berry" && (
        <g strokeWidth="3" strokeLinecap="round">
          <path
            d="M23 31 32 12l10 20M32 13c9-8 17-4 18 1-7 5-13 4-18-1Z"
            stroke="#32623b"
            fill="#78bb66"
          />
          <circle cx="22" cy="41" r="13" fill="#e65c83" stroke="#933251" />
          <circle cx="43" cy="42" r="12" fill="#d94b79" stroke="#933251" />
          <path d="m18 36 3-2M39 37l3-2" stroke="#ffd6e2" />
        </g>
      )}
    </svg>
  );
}
