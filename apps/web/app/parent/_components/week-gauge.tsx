"use client";

import { useId, useState, type PointerEvent } from "react";

// Exact Home-frame artwork and coordinates. The status counts stay connected to saved answers.
const GROUPS = [
  { key: "correct", label: "Correct", x: 17, width: 83, angle: -2.32 },
  { key: "incorrect", label: "Incorrect", x: 108, width: 94, angle: -1.22 },
  { key: "help", label: "Answered after help", x: 210, width: 153, angle: -.5 },
] as const;
type Group = (typeof GROUPS)[number];
const point = (angle: number) => ({ x: 187 + 159.5 * Math.cos(angle), y: 187 + 159.5 * Math.sin(angle) });
const INITIAL = { key: "correct", x: 78.5, y: 91.5 } as const;

export function WeekGauge({ firstTry, afterHelp, missed, unclear = 0 }: { firstTry: number; afterHelp: number; missed: number; unclear?: number }) {
  const id = useId();
  const [hover, setHover] = useState<{ key: Group["key"]; x: number; y: number }>(INITIAL);
  const counts = { correct: firstTry, incorrect: missed, help: afterHelp };
  const group = GROUPS.find(g => g.key === hover.key) ?? GROUPS[0];
  function followPointer(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * 374 / bounds.width;
    const y = (event.clientY - bounds.top) * 244 / bounds.height;
    const radius = Math.hypot(x - 187, y - 187);
    if (radius < 132 || radius > 190 || y > 190) return;
    const angle = Math.max(-Math.PI, Math.min(0, Math.atan2(y - 187, x - 187)));
    const key = angle < -1.62 ? "correct" : angle < -.8 ? "incorrect" : "help";
    setHover({ key, ...point(angle) });
  }
  const select = (g: Group) => setHover({ key: g.key, ...point(g.angle) });
  return (
    <figure className="parent-week-gauge" aria-label={`Questions asked this week: ${firstTry} correct before help, ${missed} incorrect, ${afterHelp} answered after help, ${unclear} unclear or not assessed`}>
      <svg viewBox="0 0 374 244" onPointerMove={followPointer} onPointerLeave={() => setHover(INITIAL)} aria-label="Weekly answer categories" role="group">
        <defs>
          <linearGradient id={`${id}-correct`} x1="1" y1="0" x2="0" y2="1"><stop offset=".2" stopColor="#d8fb2a" /><stop offset="1" stopColor="#0aa126" /></linearGradient>
          <linearGradient id={`${id}-incorrect`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#84d4ff" /><stop offset="1" stopColor="#1b18e9" /></linearGradient>
          <linearGradient id={`${id}-help`} x1="0" y1="0" x2=".3" y2="1"><stop offset=".34" stopColor="#ffde36" /><stop offset="1" stopColor="#ffdb93" /></linearGradient>
          <filter id={`${id}-legend-glow`} x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="5" floodOpacity=".11" /></filter>
        </defs>
        <image href="/figma/home-imgUnion.svg" x={-18.1} y={-18.1} width={410.2} height={277.2} />
        <image href="/figma/home-imgEllipse2.svg" x={4.38} y={4.93} width={187.103} height={195.28} />
        <image href="/figma/home-imgEllipse3.svg" x={174.81} y={4.38} width={136.365} height={83.1612} />
        <image href="/figma/home-imgEllipse4.svg" x={281.34} y={56.32} width={89.2907} height={143.886} />
        <text className="week-gauge-title" x={188} y={140} textAnchor="middle"><tspan x={188}>Questions Asked</tspan><tspan x={188} dy={27}>This Week</tspan></text>
        <image href="/figma/home-imgEllipse5.svg" x={hover.x - 26.6} y={hover.y - 26.6} width={53.2} height={53.2} />
        <text className="week-gauge-hover" x={hover.x < 187 ? hover.x + 8.5 : hover.x - 8.5} y={Math.min(hover.y + 18.5, 184)} textAnchor={hover.x < 187 ? "start" : "end"}>{counts[group.key]} {group.label}</text>
        <rect x={9} y={194} width={358} height={40} rx={8} fill="white" />
        {GROUPS.map(g => <g key={g.key} role="button" tabIndex={0} aria-label={`${counts[g.key]} ${g.label}`} aria-pressed={hover.key === g.key}
          className="week-gauge-legend" onPointerEnter={() => select(g)} onClick={() => select(g)} onFocus={() => select(g)}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(g); } }}>
          <rect className="legend-focus" x={g.x - 4} y={200} width={g.width} height={28} rx={7} fill="transparent" />
          <rect x={g.x} y={204} width={20} height={20} rx={6} fill={`url(#${id}-${g.key})`} filter={`url(#${id}-legend-glow)`} />
          <text className="week-gauge-legend-text" x={g.x + 24} y={219}><tspan fontWeight={500}>{counts[g.key]}</tspan><tspan fontWeight={300}> {g.label}</tspan></text>
        </g>)}
      </svg>
      {unclear > 0 && <figcaption className="week-gauge-unclear">{unclear} unclear or unassessed {unclear === 1 ? "answer" : "answers"}</figcaption>}
    </figure>
  );
}
