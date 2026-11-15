/* eslint-disable @next/next/no-img-element -- Local SVG icons keep their intrinsic geometry. */

export type TokenState = "complete" | "current" | "locked" | "planned";

/** Hexagon colour per checkpoint state: finished is blue, the one in progress yellow, later ones grey. */
export const TOKEN_COLOR: Record<TokenState, string> = {
  complete: "#90B7FF",
  current: "#FFDE36",
  locked: "#C9CBD1",
  planned: "#C9CBD1",
};

const W = 160;
const H = 180;
const CORNERS: [number, number][] = [[80, 3], [156, 46], [156, 134], [80, 177], [4, 134], [4, 46]];

/** Pointy-top hexagon with softly rounded corners. */
function roundedHex(r: number): string {
  const n = CORNERS.length;
  let d = "";
  CORNERS.forEach(([x, y], i) => {
    const [px, py] = CORNERS[(i + n - 1) % n]!;
    const [nx, ny] = CORNERS[(i + 1) % n]!;
    const toward = (ax: number, ay: number) => {
      const len = Math.hypot(ax - x, ay - y);
      return [x + ((ax - x) / len) * r, y + ((ay - y) / len) * r] as const;
    };
    const [ax, ay] = toward(px, py);
    const [bx, by] = toward(nx, ny);
    d += `${i ? "L" : "M"}${ax.toFixed(1)} ${ay.toFixed(1)}Q${x} ${y} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  });
  return `${d}Z`;
}
const HEX = roundedHex(14);
const FRONT = "M4 104 80 147 156 104"; // where the lit top face meets the front faces

/** Glassy hexagon checkpoint with the subject icon tilted in 3D, as in the Figma roadmap. */
export function RoadmapToken({ id, state, icon }: { id: string; state: TokenState; icon: string }) {
  const color = TOKEN_COLOR[state];
  const locked = state === "locked" || state === "planned";
  const g = `hex-${id}`;
  return (
    <div className="roadmap-token" data-locked={locked}>
      <svg className="roadmap-hex" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
        <defs>
          <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F1F2F6" />
            <stop offset=".38" stopColor={`color-mix(in srgb, ${color} 55%, #F1F2F6)`} />
            <stop offset=".6" stopColor={color} />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path d={HEX} fill={`url(#${g})`} />
        <path d={FRONT} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1" />
        <path d={HEX} fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="1.5" />
      </svg>
      <span className="roadmap-topic-icon tilt-3d">
        <img src={icon} alt="" width={56} height={56} />
      </span>
      {locked && <Lock />}
    </div>
  );
}

/** Solid grey padlock laid over a locked checkpoint. */
function Lock() {
  return (
    <svg className="roadmap-lock" viewBox="0 0 14 14" width="44" height="44" aria-hidden="true">
      <path d="M4.25 6.5V4.75a2.75 2.75 0 0 1 5.5 0V6.5" fill="none" stroke="#7E8088" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3.9 6h6.2c1.8 0 2.4.6 2.4 2.4v1.7c0 2.4-.9 3.4-3.4 3.4H4.9c-2.5 0-3.4-1-3.4-3.4V8.4C1.5 6.6 2.1 6 3.9 6Z" fill="#7E8088" />
      <path d="M7 8.9v1.5" stroke="#5E6068" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
