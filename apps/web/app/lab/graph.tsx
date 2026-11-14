"use client";

import { EVENTS, INITIAL, MAX_NUDGES, MAX_TRIES, STAGES, next, type Ctx, type Event, type Stage } from "./machine";

// Hand layout (viewBox 680 x 470). Assistant mode on the right, episode on the left.
const POS: Record<Stage, [number, number]> = {
  watching: [70, 40],
  entering: [70, 130],
  asking: [70, 220],
  welcome: [70, 310],
  away: [70, 420],
  listening: [260, 220],
  nudging: [260, 90],
  exiting: [260, 420],
  thinking: [440, 220],
  teaching: [440, 90],
  giving: [440, 420],
  clarifying: [610, 130],
  modeling: [610, 215],
  practicing: [440, 320],
  celebrating: [610, 300],
  graceful: [610, 420],
};
const W = 112;
const H = 34;

type Edge = { from: Stage; to: Stage; event: Event };

// Every transition the machine can make, found by probing it (AWAY is drawn from two stages only, to keep it readable).
const EDGES: Edge[] = (() => {
  const probes: Ctx[] = [
    INITIAL,
    { ...INITIAL, tries: MAX_TRIES - 1, nudges: MAX_NUDGES },
    { ...INITIAL, awayFrom: "listening" },
    { ...INITIAL, known: true, tries: MAX_TRIES - 1, nudges: MAX_NUDGES },
    { ...INITIAL, known: true, modeled: true },
    { ...INITIAL, known: true, practice: true },
    { ...INITIAL, known: true, practice: true, practiced: true },
  ];
  const seen = new Map<string, Edge>();
  for (const from of Object.keys(STAGES) as Stage[])
    for (const p of probes)
      for (const event of EVENTS) {
        if (event === "AWAY" && from !== "listening" && from !== "watching") continue;
        const to = next({ ...p, stage: from }, event).stage;
        if (to !== from) seen.set(`${from}>${to}>${event}`, { from, to, event });
      }
  return [...seen.values()];
})();

// Curve each edge a little so two-way pairs don't overlap; returns path + label point.
function geometry(e: Edge) {
  const [x1, y1] = POS[e.from];
  const [x2, y2] = POS[e.to];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bend = 22;
  const cx = (x1 + x2) / 2 - (dy / len) * bend;
  const cy = (y1 + y2) / 2 + (dx / len) * bend;
  // trim ends to the node boxes
  const trim = (x: number, y: number, tx: number, ty: number): [number, number] => {
    const ax = tx - x;
    const ay = ty - y;
    const t = Math.min(Math.abs((W / 2 + 4) / (ax || 1e-6)), Math.abs((H / 2 + 4) / (ay || 1e-6)), 1);
    return [x + ax * t, y + ay * t];
  };
  const [sx, sy] = trim(x1, y1, cx, cy);
  const [ex, ey] = trim(x2, y2, cx, cy);
  return { d: `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`, lx: (sx + 2 * cx + ex) / 4, ly: (sy + 2 * cy + ey) / 4 };
}

export function Graph({ ctx, onEvent, onForce, disabled }: {
  ctx: Ctx;
  onEvent: (e: Event) => void;
  onForce: (s: Stage) => void;
  disabled: boolean;
}) {
  const live = (e: Edge) => e.from === ctx.stage && next(ctx, e.event).stage === e.to;

  return (
    <svg viewBox="0 0 680 470" style={{ width: "100%", display: "block" }} role="img" aria-label="Stage machine">
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" strokeWidth="1.6" />
        </marker>
      </defs>

      {EDGES.filter((e) => !live(e)).map((e) => (
        <path key={`${e.from}${e.to}${e.event}`} d={geometry(e).d} fill="none" stroke="#5a4b40" strokeWidth="1" markerEnd="url(#ah)" opacity="0.55" />
      ))}

      {EDGES.filter(live).map((e) => {
        const g = geometry(e);
        return (
          <g key={`live${e.to}${e.event}`} style={{ cursor: disabled ? "default" : "pointer" }} onClick={() => !disabled && onEvent(e.event)}>
            <path d={g.d} fill="none" stroke="#7dff8a" strokeWidth="2.4" markerEnd="url(#ah)" />
            <rect x={g.lx - 52} y={g.ly - 10} width="104" height="20" rx="10" fill="#7dff8a" />
            <text x={g.lx} y={g.ly + 4} textAnchor="middle" fontSize="11" fontFamily="var(--font-geist-mono), monospace" fill="#10240f">
              {e.event}
            </text>
          </g>
        );
      })}

      {(Object.keys(POS) as Stage[]).map((st) => {
        const [x, y] = POS[st];
        const current = st === ctx.stage;
        return (
          <g key={st} style={{ cursor: disabled ? "default" : "pointer" }} onClick={() => !disabled && onForce(st)}>
            <rect
              x={x - W / 2}
              y={y - H / 2}
              width={W}
              height={H}
              rx="9"
              fill={current ? "#7dff8a" : "#2a221c"}
              stroke={current ? "#7dff8a" : STAGES[st].assistant ? "#ff9fc8" : "#8a7a6c"}
              strokeDasharray={STAGES[st].assistant && !current ? "4 3" : undefined}
            />
            <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fill={current ? "#10240f" : "#f3e9dc"} fontWeight={current ? 700 : 400}>
              {st}
            </text>
          </g>
        );
      })}

      <text x="676" y="464" textAnchor="end" fontSize="11" fill="#a8968a">
        click a green label to fire it · click a box to force it · AWAY works from any stage
      </text>
    </svg>
  );
}
