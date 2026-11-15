// Two-tone flat icons for the Tellavision parent look, drawn to the flat-duotone-icons skill:
// a 14-unit grid, squircle bodies in the light colour, details in the dark colour. Decorative only.
const DARK = "var(--color-tv-blue)";
const LIGHT = "var(--color-tv-blue-light)";

const f = (v: number) => String(Math.round(v * 100) / 100);

/** Squircle path in the box (x, y, w, h). k = 0.75 is the corner tension shared by the whole set. */
function S(x: number, y: number, w: number, h: number, k = 0.75): string {
  const c = Math.min(w, h) / 2;
  const j = c * (1 - k);
  const X = x + w;
  const Y = y + h;
  return [
    `M${f(x + c)} ${f(y)}L${f(X - c)} ${f(y)}C${f(X - j)} ${f(y)} ${f(X)} ${f(y + j)} ${f(X)} ${f(y + c)}`,
    `L${f(X)} ${f(Y - c)}C${f(X)} ${f(Y - j)} ${f(X - j)} ${f(Y)} ${f(X - c)} ${f(Y)}`,
    `L${f(x + c)} ${f(Y)}C${f(x + j)} ${f(Y)} ${f(x)} ${f(Y - j)} ${f(x)} ${f(Y - c)}`,
    `L${f(x)} ${f(y + c)}C${f(x)} ${f(y + j)} ${f(x + j)} ${f(y)} ${f(x + c)} ${f(y)}Z`,
  ].join("");
}

const Light = ({ d }: { d: string }) => <path d={d} fill={LIGHT} />;
const Dark = ({ d }: { d: string }) => <path d={d} fill={DARK} />;
/** Dark line detail. A dot is a zero-length line (`M7 6h.01`) so it matches the line weight. */
const Line = ({ d, w = 1.25 }: { d: string; w?: number }) => (
  <path d={d} fill="none" stroke={DARK} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
);

const questionMark = (cx: number, y: number) =>
  `M${f(cx - 1.5)} ${f(y + 1.5)}a1.5 1.5 0 1 1 2.3 1.27c-.5.3-.8.65-.8 1.23M${f(cx)} ${f(y + 5.6)}h.01`;

type Props = { size?: number };

function Icon({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      {children}
    </svg>
  );
}

/** Two adults (light) with a child in front (dark). */
export function FamilyIcon({ size = 20 }: Props) {
  return (
    <Icon size={size}>
      <circle cx="3.6" cy="2.5" r="2" fill={LIGHT} />
      <circle cx="10.4" cy="2.5" r="2" fill={LIGHT} />
      <Light d={S(0.5, 5.25, 6, 8.25)} />
      <Light d={S(7.5, 5.25, 6, 8.25)} />
      <circle cx="7" cy="6.75" r="1.6" fill={DARK} />
      <Dark d={S(4.75, 9, 4.5, 4.5)} />
    </Icon>
  );
}

/** Bar chart: three light bars on a dark axis. */
export function ChartIcon({ size = 32 }: Props) {
  return (
    <Icon size={size}>
      <Light d={S(3.5, 1.25, 6, 2.5)} />
      <Light d={S(3.5, 4.75, 4, 2.5)} />
      <Light d={S(3.5, 8.25, 9.5, 2.5)} />
      <Line d="M1.25 1v10.25c0 .7.55 1.25 1.25 1.25H13" />
    </Icon>
  );
}

/** Flat TV with a play triangle. */
export function EpisodesIcon({ size = 36 }: Props) {
  return (
    <Icon size={size}>
      <Light d={S(0.5, 1.25, 13, 9.75)} />
      <Line d="M4.25 13h5.5M7 11v2" />
      <Dark d="M5.6 4.6c0-.6.65-.95 1.15-.65l2.9 1.75c.5.3.5 1 0 1.3l-2.9 1.75c-.5.3-1.15-.05-1.15-.65z" />
    </Icon>
  );
}

/** Speech bubble with a question mark. */
export function QuestionsIcon({ size = 36 }: Props) {
  return (
    <Icon size={size}>
      <Light d={S(0.5, 1, 13, 10.5)} />
      <Light d="M3 10.5h4L3.6 13.2c-.3.25-.7 0-.65-.4z" />
      <Line d={questionMark(7, 3.2)} />
    </Icon>
  );
}

/** Unsure face with a question mark beside it. */
export function HelpIcon({ size = 36 }: Props) {
  return (
    <Icon size={size}>
      <Light d={S(0.5, 3.5, 10, 10)} />
      <Line d="M3.75 7.75h.01M7.25 7.75h.01" />
      <Line d="M4.4 10.7 6.6 10.2" />
      <Line d={questionMark(11.5, 0.75)} />
    </Icon>
  );
}
