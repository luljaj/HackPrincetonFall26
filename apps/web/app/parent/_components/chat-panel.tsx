"use client";

import Link from "next/link";
import { LESSONS_EVENT } from "../../../lib/play/language-lessons";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DEFAULT_FOCUS,
  FocusSchema,
  FOCUS_EVENT,
  FOCUS_LABEL,
  type FocusEventDetail,
  SUBJECTS,
  type Focus,
  type FocusLevel,
} from "../../../lib/parent/preferences";
import { demoAnswer, DEMO_MODE_EVENT, isDemoPrompt, readDemoMode } from "../../../lib/parent/demo-mode";
import { Plus, RotateCcw, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import styles from "./chat-panel.module.css";

type Tone = "good" | "help" | "miss" | "neutral";
type Visual = {
  headline: string;
  kind: "rows" | "stats" | "steps" | "none";
  items: { label: string; value: string; detail: string; tone: Tone }[];
};
type FocusChange = { before: Focus; after: Focus };
type Turn = {
  id: number;
  prompt: string;
  status: "pending" | "done" | "error";
  reply?: string;
  visual?: Visual;
  sessionIds?: string[];
  focusChange?: FocusChange;
  error?: string;
};

const TONE_LABEL: Record<Tone, string> = {
  good: "Correct before help",
  help: "Correct after help",
  miss: "Assessed incorrect",
  neutral: "",
};

function Sparkle() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 2l2.1 5.9L18 10l-5.9 2.1L10 18l-2.1-5.9L2 10l5.9-2.1zM19 14l1.1 3.1L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-.9z" />
    </svg>
  );
}


const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// One slow veil that rises through the whole page when the companion opens.
const SWEEP_MS = 2800;
const SWEEP_EASE = "cubic-bezier(0.4, 0, 0.3, 1)";
// How long a reply takes to replace its skeleton.
const REVEAL_MS = 650;

/** Raise the veil through `panel` once; `content` comes up behind it. */
function playSweep(panel: HTMLElement, wave: HTMLElement, content?: HTMLElement | null) {
  const timing = { duration: SWEEP_MS, easing: SWEEP_EASE };
  const box = panel.getBoundingClientRect();
  const waveH = wave.offsetHeight || 300;
  // The veil's middle crosses a point y (in panel space) at this share of the sweep.
  const when = (y: number) => Math.min(1, Math.max(0, (box.height + waveH / 2 - y) / (box.height + waveH)));
  const animations: (Animation | undefined)[] = [
    wave.animate(
      [
        { transform: `translateY(${box.height}px) scaleX(.85)`, opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.08 },
        { opacity: 1, offset: 0.9 },
        { transform: `translateY(${-waveH}px) scaleX(1.1)`, opacity: 0, offset: 1 },
      ],
      timing,
    ),
    // The veil's body breathes as it rises: it swells, pulls in, and swells
    // again, drifting side to side, so it reads as a ripple rather than a slab.
    wave.firstElementChild?.animate(
      [
        { transform: "translateX(0) scale(1, 1)" },
        { transform: "translateX(2%) scale(1.07, 1.28)", offset: 0.22 },
        { transform: "translateX(-2.5%) scale(0.95, 0.86)", offset: 0.45 },
        { transform: "translateX(1.5%) scale(1.05, 1.2)", offset: 0.68 },
        { transform: "translateX(-1%) scale(0.97, 0.92)", offset: 0.86 },
        { transform: "translateX(0) scale(1, 1)" },
      ],
      { duration: SWEEP_MS, easing: "ease-in-out" },
    ),
  ];
  if (content) {
    const rect = content.getBoundingClientRect();
    const bottom = when(rect.bottom - box.top);
    const top = Math.max(bottom + 0.001, when(rect.top - box.top));
    animations.push(
      content.animate(
        [
          { clipPath: "inset(100% 0 0 0)", offset: 0 },
          { clipPath: "inset(100% 0 0 0)", offset: bottom },
          { clipPath: "inset(0 0 0 0)", offset: top },
          { clipPath: "inset(0 0 0 0)", offset: 1 },
        ],
        timing,
      ),
    );
  }
  return () => animations.forEach((a) => a?.cancel());
}

// A question's answer, drawn as a small sheet.
function Sheet({ turn }: { turn: Turn }) {
  const items = turn.visual?.items ?? [];
  const kind = turn.visual?.kind ?? "none";

  return (
    <article className={styles.sheet} data-kind={kind}>
      <div className={styles.sheetHead}>
        <div className={styles.real}>
          <h3>{turn.visual?.headline ?? turn.reply}</h3>
          {turn.visual && <p>{turn.reply}</p>}
        </div>
      </div>
      {items.length > 0 && (
        <ol className={styles.rows}>
          {items.map((item, index) => (
            <li
              key={index}
              className={styles.row}
              data-tone={item.tone}
            >
              <div className={styles.rowInner}>
                <span className={styles.rowIndex} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={`${styles.real} ${styles.cell}`}>
                  <span className={styles.cellLabel}>
                    <b>{item.label}</b>
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                  {(item.value || item.tone !== "neutral") && (
                    <span className={styles.cellValue}>
                      {item.value || TONE_LABEL[item.tone]}
                    </span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!!turn.sessionIds?.length && (
        <div className={styles.sources}>
          <span>From</span>
          {turn.sessionIds.slice(0, 5).map((id, i) => (
            <Link key={id} href={`/parent/${encodeURIComponent(id)}`}>
              Session {i + 1} <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

const STEP: Record<FocusLevel, number> = { less: 1, usual: 2, more: 3 };
// Where each level sits on the dial, as a share of the arc.
const SHARE: Record<FocusLevel, number> = { less: 1 / 6, usual: 1 / 2, more: 5 / 6 };

// A point on the dial; 180° is the far left, 0° the far right. Centre (60, 60).
const at = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return `${(60 + r * Math.cos(rad)).toFixed(2)} ${(60 - r * Math.sin(rad)).toFixed(2)}`;
};
const TRACK = `M ${at(180, 50)} A 50 50 0 0 1 ${at(0, 50)}`;
const TICKS = Array.from({ length: 25 }, (_, i) => 180 - i * 7.5);
const LEVEL_TICKS = [150, 90, 30];

function DialFace({ children }: { children?: React.ReactNode }) {
  return (
    <svg viewBox="0 -4 120 70" className={styles.dial} aria-hidden="true">
      {TICKS.map((deg) => (
        <path
          key={deg}
          d={`M ${at(deg, 42)} L ${at(deg, LEVEL_TICKS.includes(deg) ? 36 : 39.5)}`}
          className={styles.tick}
          data-major={LEVEL_TICKS.includes(deg) || undefined}
        />
      ))}
      <path d={TRACK} className={styles.track} pathLength={100} />
      {children}
    </svg>
  );
}

function Dial({ level, color }: { level: FocusLevel; color: string }) {
  const share = SHARE[level];
  return (
    <DialFace>
      <path
        d={TRACK}
        className={styles.fill}
        pathLength={100}
        style={{ stroke: color, strokeDashoffset: 100 * (1 - share) }}
      />
      <g className={styles.needle} style={{ "--angle": `${-90 + 180 * share}deg` } as React.CSSProperties}>
        <line x1="60" y1="60" x2="60" y2="20" stroke="#23263a" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <circle cx="60" cy="60" r="3.2" fill="#23263a" />
          </DialFace>
  );
}

// The subject weights as three dials. They come up on the old weights behind the
// sweep, then the changed ones crank over to their new level.
function FocusBoard({
  focus,
  change,
  headline,
  reply,
  crankAt = 0,
}: {
  focus: Focus;
  change?: { before: Focus; after: Focus };
  headline?: string;
  reply?: string;
  crankAt?: number;
}) {
  // Hold the old weights until the sweep has uncovered the dials, then crank.
  const [shown, setShown] = useState<Focus>(change?.before ?? focus);
  useEffect(() => {
    if (!change) {
      setShown(focus);
      return;
    }
    const timer = window.setTimeout(
      () => setShown(change.after),
      reducedMotion() ? 0 : crankAt,
    );
    return () => window.clearTimeout(timer);
  }, [change, focus, crankAt]);

  const isChanged = (id: string) => !!change && change.before[id] !== change.after[id];
  const hero = SUBJECTS.filter((subject) => isChanged(subject.id));
  const rest = SUBJECTS.filter((subject) => !isChanged(subject.id));

  return (
    <article className={styles.board}>
      <div className={styles.boardHead}>
        <div className={styles.real}>
          <h3>{headline}</h3>
          {reply && reply !== headline && <p>{reply}</p>}
        </div>
      </div>
      {/* What changed gets a full dial; everything else sits in a quiet row below. */}
      <ul className={styles.subjects}>
        {hero.map((subject) => {
          const before = change?.before[subject.id];
          const level = shown[subject.id] ?? "usual";
          const changed = !!change && before !== change.after[subject.id];
          return (
            <li
              key={subject.id}
              className={styles.subject}
              data-changed={changed || undefined}
              data-cranked={(changed && level === change.after[subject.id]) || undefined}
              style={{ "--subject": subject.color } as React.CSSProperties}
              role="meter"
              aria-label={`${subject.name} focus`}
              aria-valuemin={1}
              aria-valuemax={3}
              aria-valuenow={STEP[level]}
              aria-valuetext={FOCUS_LABEL[level]}
            >
              <Dial level={level} color={subject.color} />
              <span className={styles.subjectLevel}>
                <b key={level}>{FOCUS_LABEL[level]}</b>
              </span>
              <span className={styles.subjectName}>
                <i aria-hidden="true" />
                {subject.name}
                {changed && before && <s>was {FOCUS_LABEL[before].toLowerCase()}</s>}
              </span>
            </li>
          );
        })}
      </ul>
      {rest.length > 0 && (
        <div className={styles.restRow}>
          <span className={styles.focusStripLabel}>
            {hero.length > 0 ? "Everything else stays as it was" : "Learning focus"}
          </span>
          {rest.map((subject) => {
            const level = shown[subject.id] ?? "usual";
            return (
              <span key={subject.id} className={styles.focusChip}>
                <span className={styles.miniDial}>
                  <Dial level={level} color={subject.color} />
                </span>
                <span>
                  <b>{subject.name}</b>
                  <small>{FOCUS_LABEL[level]}</small>
                </span>
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}

// Guess the answer's shape from the prompt, so the skeleton looks like what's coming.
const STEERING = /\b(more|less|fewer|usual|focus|turn|crank|boost|bump|raise|lower|reduce|increase|decrease|dial)\b/i;

function Skeleton({ shape, child }: { shape: "dials" | "rows"; child: string }) {
  return (
    <div className={styles.skeleton} data-shape={shape}>
      <div className={styles.skeletonHead}>
        <span className={styles.bars}>
          <i style={{ width: "46%" }} />
          <i style={{ width: "74%", height: 8 }} />
        </span>
        <span className={styles.working} role="status">
          <span className={styles.thinkingDot} />
          {shape === "dials" ? "Adjusting the focus…" : `Looking at ${child}'s learning…`}
        </span>
      </div>
      {shape === "dials" ? (
        <>
          <div className={styles.subjects}>
            <div className={styles.subject}>
              <DialFace />
              <span className={styles.bars} data-center>
                <i style={{ width: 84, height: 22 }} />
                <i style={{ width: 96, height: 8 }} />
              </span>
            </div>
          </div>
          <div className={styles.restRow}>
            <span className={styles.bars} data-center style={{ width: "100%" }}>
              <i style={{ width: 150, height: 8 }} />
            </span>
            {SUBJECTS.slice(1).map((subject) => (
              <span key={subject.id} className={styles.focusChip} data-ghost>
                <span className={styles.miniDial}>
                  <DialFace />
                </span>
                <span className={styles.bars}>
                  <i style={{ width: 64, height: 9 }} />
                  <i style={{ width: 36, height: 7 }} />
                </span>
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.rows}>
          {[48, 66, 38, 58, 44].map((width, i) => (
            <div key={i} className={styles.rowInner}>
              <span className={styles.rowIndex}>{i + 1}</span>
              <span className={`${styles.cell} ${styles.bars}`} data-row>
                <i style={{ width: `${width}%` }} />
                <i style={{ width: 52 }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One card per message, filling the window. It starts as a skeleton; when the
// answer lands it crossfades in. (The big veil plays once, when the page opens.)
function Result({ turn, focus, child }: { turn: Turn; focus: Focus; child: string }) {
  const done = turn.status === "done";
  const [shape] = useState<"dials" | "rows">(() => (STEERING.test(turn.prompt) ? "dials" : "rows"));
  const cardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const realRef = useRef<HTMLDivElement>(null);
  const sawPending = useRef(!done);
  const [crankAt] = useState(() => REVEAL_MS * 0.6);

  // Before paint, so the finished card never shows ahead of the crossfade.
  // The skeleton blurs away while the answer settles in, in the same frame.
  useLayoutEffect(() => {
    if (!done || !sawPending.current || reducedMotion()) return;
    sawPending.current = false;
    const timing = { duration: REVEAL_MS, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
    const animations = [
      realRef.current?.animate(
        [
          { opacity: 0, filter: "blur(8px)", transform: "translateY(10px)" },
          { opacity: 1, filter: "blur(0)", transform: "none" },
        ],
        timing,
      ),
      ghostRef.current?.animate(
        [
          { opacity: 1, filter: "blur(0)", clipPath: "inset(0 0 0 0)" },
          { opacity: 0, filter: "blur(6px)", clipPath: "inset(0 0 0 0)" },
        ],
        { ...timing, duration: REVEAL_MS * 0.7, fill: "forwards" },
      ),
    ];
    return () => animations.forEach((a) => a?.cancel());
  }, [done]);

  return (
    <Card
      ref={cardRef}
      className={cn(styles.result, "gap-0 rounded-[28px] py-0")}
      data-status={turn.status}
      aria-busy={!done}
    >
      {done && (
        <div ref={realRef} className={styles.realLayer}>
          {turn.focusChange ? (
            <FocusBoard
              focus={focus}
              change={turn.focusChange}
              headline={turn.visual?.headline ?? turn.reply}
              reply={turn.reply}
              crankAt={crankAt}
            />
          ) : (
            <Sheet turn={turn} />
          )}
        </div>
      )}
      <div ref={ghostRef} className={styles.ghostLayer} aria-hidden={done}>
        <Skeleton shape={shape} child={child} />
      </div>
    </Card>
  );
}

// One exchange: the parent's message, then the companion's reply.
function Exchange({
  turn,
  latest,
  focus,
  child,
  busy,
  onRetry,
  origin,
}: {
  turn: Turn;
  latest: boolean;
  focus: Focus;
  child: string;
  busy: boolean;
  onRetry: () => void;
  /** The input the message was typed in; a new message lifts out of it. */
  origin: React.RefObject<HTMLElement | null>;
}) {
  const bubbleRef = useRef<HTMLParagraphElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);
  const [fresh] = useState(() => turn.status === "pending");

  // Sending: the text lifts out of the input bar and settles into its bubble,
  // then the reply row rises in behind it. Only for messages sent just now.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const from = origin.current?.getBoundingClientRect();
    if (!fresh || !bubble || !from || reducedMotion()) return;
    const to = bubble.getBoundingClientRect();
    const dx = from.left - (to.left + 16); // 16px: the bubble's own padding
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
    const animations = [
      bubble.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.98)`, backgroundColor: "rgb(236 238 255 / 0)" },
          { backgroundColor: "rgb(236 238 255 / 0)", offset: 0.35 },
          { transform: "none", backgroundColor: "var(--accent)" },
        ],
        { duration: 620, easing: ease },
      ),
      bubble.nextElementSibling?.animate(
        [
          { opacity: 0, transform: "scale(0.6)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 400, delay: 260, easing: ease, fill: "backwards" },
      ),
      agentRef.current?.animate(
        [
          { opacity: 0, transform: "translateY(24px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 560, delay: 220, easing: ease, fill: "backwards" },
      ),
    ];
    return () => animations.forEach((a) => a?.cancel());
  }, [fresh, origin]);

  const status =
    turn.status === "pending"
      ? { label: "Working on it", variant: "secondary" as const }
      : turn.status === "error"
        ? { label: "Didn't go through", variant: "destructive" as const }
        : turn.focusChange
          ? { label: "Focus updated", variant: "default" as const }
          : { label: "Answer", variant: "outline" as const };
  return (
    <section className={styles.turn} data-latest={latest}>
      <div className={styles.userRow}>
        <p
          ref={bubbleRef}
          className="max-w-[min(70%,560px)] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm leading-relaxed text-accent-foreground [overflow-wrap:anywhere]">
          {turn.prompt}
        </p>
        <Avatar className="mt-0.5 border">
          <AvatarFallback className="bg-card text-xs font-semibold text-secondary-foreground">P</AvatarFallback>
        </Avatar>
      </div>
      <div ref={agentRef} className={styles.agentRow}>
        <Avatar className="mt-0.5">
          <AvatarFallback className="bg-gradient-to-br from-[#5866ff] to-[#9a6bff] text-white">
            <Sparkles className="size-4" />
          </AvatarFallback>
        </Avatar>
        <div className={styles.agentBody}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-card-foreground">tellavision</span>
            {/* Re-keyed so each status change pops in. */}
            <Badge key={status.label} variant={status.variant} className={cn(styles.badgePop, "rounded-full")}>
              {status.label}
            </Badge>
          </div>
          {turn.status === "error" ? (
            <Card className="gap-3 rounded-3xl px-5 py-4" role="alert">
              <p className="text-sm text-muted-foreground">{turn.error}</p>
              <div>
                <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={onRetry}>
                  <RotateCcw />
                  Try again
                </Button>
              </div>
            </Card>
          ) : (
            <Result turn={turn} focus={focus} child={child} />
          )}
        </div>
      </div>
    </section>
  );
}

// A nonmodal agent region: the dashboard stays usable while it is open.
export function ChatPanel({ child }: { child: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const [focus, setFocus] = useState<Focus>(DEFAULT_FOCUS);
  const [demoMode, setDemoMode] = useState(false);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const busy = turns.some((turn) => turn.status === "pending");

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    setDemoMode(readDemoMode());
    const sync = (event: Event) => setDemoMode((event as CustomEvent<boolean>).detail);
    window.addEventListener(DEMO_MODE_EVENT, sync);
    return () => window.removeEventListener(DEMO_MODE_EVENT, sync);
  }, []);

  // Keep the weights in step with the page's Learning focus card, both ways.
  useEffect(() => {
    fetch("/api/parent/preferences", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((prefs) => prefs?.focus && setFocus(prefs.focus))
      .catch(() => {});
    const onChange = (event: Event) => setFocus((event as CustomEvent<FocusEventDetail>).detail.focus);
    window.addEventListener(FOCUS_EVENT, onChange);
    return () => window.removeEventListener(FOCUS_EVENT, onChange);
  }, []);

  useEffect(() => {
    // Scroll only the agent panel, never the dashboard behind it.
    // Bring the newest message to the top, so its prompt stays in view above the answer.
    const scroll = scrollRef.current;
    const latestTurn = scroll?.querySelector<HTMLElement>('[data-latest="true"]');
    if (scroll)
      scroll.scrollTo({
        top: latestTurn ? latestTurn.offsetTop - 12 : scroll.scrollHeight,
        behavior: reducedMotion() ? "auto" : "smooth",
      });
  }, [turns.length, open]);

  const composerRef = useRef<HTMLFormElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  // The page grows out of the input bar, so its closed clip is the bar's box.
  // Measure while closed (the bar moves once the page is open).
  useLayoutEffect(() => {
    if (open) return;
    const measure = () => {
      const bar = composerRef.current?.getBoundingClientRect();
      const dock = dockRef.current;
      if (!bar || !dock) return;
      dock.style.setProperty("--bar-top", `${bar.top}px`);
      dock.style.setProperty("--bar-left", `${bar.left}px`);
      dock.style.setProperty("--bar-right", `${window.innerWidth - bar.right}px`);
      dock.style.setProperty("--bar-bottom", `${window.innerHeight - bar.bottom}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // The big veil plays once each time the page opens; the page's content comes up behind it.
  useEffect(() => {
    const panel = panelRef.current;
    const wave = waveRef.current;
    if (!open || !panel || !wave || reducedMotion()) return;
    return playSweep(panel, wave, scrollRef.current);
  }, [open]);

  function toggle(next: boolean) {
    setOpen(next);
    inputRef.current?.focus({ preventScroll: true });
  }

  async function ask(prompt: string, history: Turn[]) {
    const id = nextId.current++;
    const controller = new AbortController();
    requestRef.current = controller;
    setTurns([...history, { id, prompt, status: "pending" }]);
    setOpen(true);
    inputRef.current?.focus({ preventScroll: true });
    const update = (patch: Partial<Turn>) =>
      setTurns((all) =>
        all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)),
      );
    const messages = history
      .filter((turn) => turn.status === "done")
      .flatMap((turn) => [
        { role: "user", content: turn.prompt },
        { role: "assistant", content: turn.reply ?? "" },
      ])
      .concat({ role: "user", content: prompt })
      .slice(-30)
      .map((m) => ({ ...m, content: m.content.slice(0, 2000) }));
    try {
      // Demo Mode: the rehearsed prompt skips the model. It saves the real focus
      // change immediately; the result animation supplies its own pacing.
      if (demoMode && isDemoPrompt(prompt)) {
        const before = focusRef.current;
        const answer = demoAnswer(child, before);
        const res = await fetch("/api/parent/plan", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ focus: answer.after }),
          });
        if (!res.ok) throw new Error("Couldn't change the focus. Try again.");
        const saved = { focus: FocusSchema.parse((await res.json()).focus) };
        update({
          status: "done",
          reply: answer.reply,
          visual: { headline: answer.headline, kind: "none", items: [] },
          sessionIds: [],
          focusChange: { before, after: saved.focus },
        });
        setFocus(saved.focus);
        window.dispatchEvent(
          new CustomEvent<FocusEventDetail>(FOCUS_EVENT, {
            detail: { focus: saved.focus, from: "companion" },
          }),
        );
        return;
      }
      const res = await fetch("/api/parent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages, demo: demoMode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      if (typeof body.reply !== "string" || !body.reply.trim())
        throw new Error("No reply came through. Try again.");
      update({
        status: "done",
        reply: body.reply,
        visual: body.visual,
        sessionIds: body.sessionIds,
        focusChange: body.focusChange,
      });
      if (body.lessonChanged) window.dispatchEvent(new Event(LESSONS_EVENT));
      if (body.masteryReset?.length || body.languageChange !== undefined || body.lessonChanged) router.refresh();
      if (body.focusChange?.after) {
        setFocus(body.focusChange.after);
        window.dispatchEvent(new CustomEvent<FocusEventDetail>(FOCUS_EVENT, {
            detail: { focus: body.focusChange.after, from: "companion" },
          }));
      }
    } catch (e) {
      if (!controller.signal.aborted)
        update({
          status: "error",
          error: e instanceof Error ? e.message : "Something went wrong.",
        });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function send(text: string) {
    const prompt = text.trim();
    if (!prompt || requestRef.current) return;
    setDraft("");
    void ask(prompt, turns);
  }

  function retry(turn: Turn) {
    if (requestRef.current) return;
    void ask(
      turn.prompt,
      turns.filter((t) => t.id !== turn.id),
    );
  }

  const starters = [
    { label: "Catch me up", detail: `What did ${child} learn today?` },
    { label: "Find a pattern", detail: `How is ${child} doing with addition?` },
    {
      label: "Plan a little practice",
      detail: "What should we practice next?",
    },
  ];
  const latest = turns.at(-1);

  return (
    <div
      ref={dockRef}
      className={styles.dock}
      data-open={open}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          toggle(false);
        }
      }}
    >
      <section
        ref={panelRef}
        id="parent-agent-panel"
        aria-labelledby="parent-agent-title"
        className={styles.panel}
        inert={!open}
        aria-hidden={!open}
      >
        <div className={styles.ambient} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.mark} aria-hidden="true">
              <Sparkle />
            </span>
            <h2 id="parent-agent-title">tellavision</h2>
            <Badge variant="outline" className={cn(styles.statusPill, "rounded-full bg-card/80")} data-busy={busy}>
              <span className={styles.statusDot} aria-hidden="true" />
              {busy ? "Working on it" : "Ready"}
            </Badge>
          </div>
          <div className={styles.actions}>
            {turns.length > 0 && (
              <Button
                variant="outline"
                className="rounded-full bg-card"
                disabled={busy}
                onClick={() => {
                  setTurns([]);
                  inputRef.current?.focus();
                }}
              >
                <Plus />
                New chat
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-full bg-card"
              aria-label="Close companion"
              onClick={() => toggle(false)}
            >
              Close
              <kbd className="rounded-md border px-1.5 text-[10px] font-normal text-muted-foreground">Esc</kbd>
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className={styles.conversation}>
          {turns.length === 0 ? (
            <div className={styles.welcome}>
              <span className={styles.orb} aria-hidden="true">
                <Sparkle />
              </span>
              <h3>
                What should {child} explore next?
              </h3>
              <p>Ask about {child}&apos;s learning, or tell me what to change. I&apos;ll take care of it.</p>
              <div className={styles.starters}>
                {starters.map(({ label, detail }) => (
                  <button key={label} type="button" onClick={() => send(detail)}>
                    <span>{label}</span>
                    <small>{detail}</small>
                    <span className={styles.starterArrow} aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              <div className={styles.focusStrip} aria-label="Current learning focus">
                <span className={styles.focusStripLabel}>Learning focus</span>
                {SUBJECTS.map((subject) => (
                  <span key={subject.id} className={styles.focusChip}>
                    <span className={styles.miniDial}>
                      <Dial level={focus[subject.id] ?? "usual"} color={subject.color} />
                    </span>
                    <span>
                      <b>{subject.name}</b>
                      <small>{FOCUS_LABEL[focus[subject.id] ?? "usual"]}</small>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.turns} role="log" aria-label="Answers" aria-live="polite">
              {turns.map((turn) => (
                <Exchange
                  key={turn.id}
                  turn={turn}
                  latest={turn === latest}
                  focus={focus}
                  child={child}
                  busy={busy}
                  onRetry={() => retry(turn)}
                  origin={inputRef}
                />
              ))}
            </div>
          )}
        </div>
        <div ref={waveRef} className={styles.revealWave} aria-hidden="true">
          <div />
        </div>
      </section>

      <form
        ref={composerRef}
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <button
          type="button"
          className={styles.sparkleButton}
          aria-label={open ? "Minimize" : "Open learning companion"}
          aria-expanded={open}
          aria-controls="parent-agent-panel"
          onClick={() => toggle(!open)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/home-imgVector.svg" alt="" width={16} height={16} />
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (!open) setOpen(true);
          }}
          onClick={() => !open && setOpen(true)}
          placeholder={`Have ${child} learn more about addition…`}
          aria-label="Ask about your child's learning"
          aria-controls="parent-agent-panel"
          maxLength={2000}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing)
              event.preventDefault();
          }}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className={styles.sendButton}
          aria-label="Send"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/home-imgFluentArrowEnterLeft24Filled.svg" alt="" width={22} height={22} />
        </button>
      </form>
    </div>
  );
}
