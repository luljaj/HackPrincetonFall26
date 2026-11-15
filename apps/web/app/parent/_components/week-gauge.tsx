// "This week" half-ring: green = answered before help, blue = after help, yellow = missed or unclear.
// Arc lengths are proportional to the counts; an empty week shows a grey ring.
const CX = 160;
const CY = 160;
const R = 128;
const GAP = 0.06; // radians between segments

const pt = (a: number) => `${(CX + R * Math.cos(a)).toFixed(1)} ${(CY - R * Math.sin(a)).toFixed(1)}`;
const arc = (from: number, to: number) => `M ${pt(from)} A ${R} ${R} 0 0 1 ${pt(to)}`;

export function WeekGauge({ firstTry, afterHelp, missed }: { firstTry: number; afterHelp: number; missed: number }) {
  const asked = firstTry + afterHelp + missed;
  const parts = [
    { n: firstTry, color: "#6cc04a", label: "before help" },
    { n: afterHelp, color: "#5b7cfa", label: "after help" },
    { n: missed, color: "#f5cf5a", label: "missed" },
  ].filter((p) => p.n > 0);
  const gaps = GAP * Math.max(parts.length - 1, 0);
  let at = Math.PI;
  const segments = parts.map((p) => {
    const span = ((Math.PI - gaps) * p.n) / asked;
    const d = arc(at, at - span);
    at -= span + GAP;
    return { ...p, d };
  });

  return (
    <figure className="relative mx-auto w-full max-w-[420px]" aria-label={`This week: ${asked} questions asked, ${firstTry + afterHelp} correct`}>
      <figcaption className="mb-2 text-center text-[20px] tracking-tight">This week</figcaption>
      <div className="rounded-t-[200px] rounded-b-2xl bg-white/80 px-4 pt-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <svg viewBox="0 0 320 175" className="w-full" role="img" aria-hidden>
          <path d={arc(Math.PI, 0)} stroke="#eef0f4" strokeWidth="22" fill="none" strokeLinecap="round" />
          {segments.map((s) => (
            <path key={s.label} d={s.d} stroke={s.color} strokeWidth="22" fill="none" strokeLinecap="round" />
          ))}
          <text x={CX} y={CY - 70} textAnchor="middle" fontSize="13" fill="#6b6f7a">
            {firstTry + afterHelp} correct
          </text>
          <text x={CX} y={CY - 32} textAnchor="middle" fontSize="34" fontWeight="600" fill="#23201c">
            {asked}
          </text>
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize="13" fill="#23201c">
            Questions asked this week
          </text>
        </svg>
        <ul className="flex justify-center gap-4 pb-3 text-[11px] text-foreground/60">
          {[["#6cc04a", "Before help"], ["#5b7cfa", "After help"], ["#f5cf5a", "Missed"]].map(([c, l]) => (
            <li key={l} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />
              {l}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
