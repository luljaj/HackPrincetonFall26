import type { ParentStats } from "../../../lib/parent/wording";

const LIGHT = "#8fa6ff";
const DARK = "#2f45e8";

export const Tv = (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
    <rect x="3" y="4" width="26" height="19" rx="5" fill={LIGHT} />
    <path d="M13 9.5v8l6.5-4z" fill={DARK} />
    <rect x="14" y="23" width="4" height="3" fill={DARK} />
    <rect x="9" y="26" width="14" height="2.5" rx="1.25" fill={DARK} />
  </svg>
);

const Bubbles = (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
    <path d="M3 7a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H9l-5 4v-4.5A4 4 0 0 1 3 14z" fill={LIGHT} />
    <path d="M14 15a4 4 0 0 1 4-4h7a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4v4l-5-4h-2a4 4 0 0 1-4-4z" fill={DARK} />
    <text x="12.5" y="13.5" fontSize="10" fontWeight="700" fill={DARK} textAnchor="middle">?</text>
  </svg>
);

const Puzzled = (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
    <circle cx="14" cy="18" r="11" fill={LIGHT} />
    <circle cx="10" cy="16" r="1.6" fill={DARK} />
    <circle cx="17" cy="16" r="1.6" fill={DARK} />
    <path d="M9.5 22.5q4-2 8 0" stroke={DARK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <text x="25" y="11" fontSize="12" fontWeight="700" fill={DARK} textAnchor="middle">?</text>
  </svg>
);

export const STAT_TILES: Array<{ key: keyof ParentStats; icon: React.ReactNode }> = [
  { key: "sessions", icon: Tv },
  { key: "answered", icon: Bubbles },
  { key: "correctAfterHelp", icon: Puzzled },
];
