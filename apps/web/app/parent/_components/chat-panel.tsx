"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DEFAULT_FOCUS,
  FOCUS_EVENT,
  FOCUS_LABEL,
  type FocusEventDetail,
  SUBJECTS,
  type Focus,
  type FocusLevel,
} from "../../../lib/parent/preferences";
import { demoAnswer, DEMO_MODE_EVENT, isDemoPrompt, readDemoMode } from "../../../lib/parent/demo-mode";
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

// One slow veil that rises through the whole agent window when an answer lands.
const SWEEP_MS = 2800;
const SWEEP_EASE = "cubic-bezier(0.4, 0, 0.3, 1)";
const WAVE_H = 300;
type Stage = { panel: React.RefObject<HTMLElement | null>; wave: React.RefObject<HTMLDivElement | null> };
const StageContext = createContext<Stage | null>(null);

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

  return (
    <article className={styles.board}>
      <div className={styles.boardHead}>
        <div className={styles.real}>
          <h3>{headline}</h3>
          {reply && reply !== headline && <p>{reply}</p>}
        </div>
      </div>
      <ul className={styles.subjects}>
        {SUBJECTS.map((subject) => {
          const before = change?.before[subject.id];
          const level = shown[subject.id];
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
        <div className={styles.subjects}>
          {SUBJECTS.map((subject) => (
            <div key={subject.id} className={styles.subject}>
              <DialFace />
              <span className={styles.bars} data-center>
                <i style={{ width: 54, height: 16 }} />
                <i style={{ width: 70, height: 8 }} />
              </span>
            </div>
          ))}
        </div>
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
// answer lands, the window's veil rises once, slowly, and the real answer comes
// up behind it: below the veil it's real, above it still skeleton.
function Result({ turn, focus, child }: { turn: Turn; focus: Focus; child: string }) {
  const done = turn.status === "done";
  const stage = useContext(StageContext);
  const [shape] = useState<"dials" | "rows">(() => (STEERING.test(turn.prompt) ? "dials" : "rows"));
  const cardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const realRef = useRef<HTMLDivElement>(null);
  const sawPending = useRef(!done);
  const [crankAt] = useState(() => SWEEP_MS * 0.55);

  // Before paint, so the finished card never shows ahead of the veil.
  useLayoutEffect(() => {
    const panel = stage?.panel.current;
    const card = cardRef.current;
    if (!done || !sawPending.current || !panel || !card || reducedMotion()) return;
    sawPending.current = false;
    const timing = { duration: SWEEP_MS, easing: SWEEP_EASE };
    const box = panel.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    // The veil's top travels from the panel's bottom edge to above its top. Its
    // middle crosses a point y (in panel space) at this share of the sweep:
    const span = box.height + WAVE_H;
    const when = (y: number) => Math.min(1, Math.max(0, (box.height + WAVE_H / 2 - y) / span));
    const bottom = when(rect.bottom - box.top);
    const top = Math.max(bottom + 0.001, when(rect.top - box.top));
    const edge = (hidden: string, shown: string) => [
      { clipPath: hidden, offset: 0 },
      { clipPath: hidden, offset: bottom },
      { clipPath: shown, offset: top },
      { clipPath: shown, offset: 1 },
    ];
    const animations = [
      stage.wave.current?.animate(
        [
          { transform: `translateY(${box.height}px) scaleX(.85)`, opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.9 },
          { transform: `translateY(${-WAVE_H}px) scaleX(1.1)`, opacity: 0, offset: 1 },
        ],
        timing,
      ),
      // The veil's body breathes as it rises: it swells, pulls in, and swells
      // again, drifting side to side, so it reads as a ripple rather than a slab.
      stage.wave.current?.firstElementChild?.animate(
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
      realRef.current?.animate(edge("inset(100% 0 0 0)", "inset(0 0 0 0)"), timing),
      ghostRef.current?.animate(edge("inset(0 0 0 0)", "inset(0 0 100% 0)"), { ...timing, fill: "forwards" }),
    ];
    return () => animations.forEach((a) => a?.cancel());
  }, [done, stage]);

  return (
    <div ref={cardRef} className={styles.result} data-status={turn.status} aria-busy={!done}>
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
    </div>
  );
}

// A nonmodal agent region: the dashboard stays usable while it is open.
export function ChatPanel({ child }: { child: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [stage] = useState<Stage>(() => ({ panel: panelRef, wave: waveRef }));
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
    const scroll = scrollRef.current;
    if (scroll)
      scroll.scrollTo({
        top: scroll.scrollHeight,
        behavior: reducedMotion() ? "auto" : "smooth",
      });
  }, [turns, open]);

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
      // change and holds the skeleton just long enough to read as "working".
      if (demoMode && isDemoPrompt(prompt)) {
        const before = focusRef.current;
        const answer = demoAnswer(child, before);
        const [res] = await Promise.all([
          fetch("/api/parent/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ focus: answer.after }),
          }),
          new Promise((resolve) => setTimeout(resolve, 900)),
        ]);
        if (!res.ok) throw new Error("Couldn't change the focus. Try again.");
        const saved = (await res.json()) as { focus: Focus };
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
        body: JSON.stringify({ messages }),
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
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.statusDot} data-busy={busy} aria-hidden="true" />
            <h2 id="parent-agent-title">{child}&apos;s companion</h2>
            <span className={styles.headerLabel}>
              {busy ? "Working on it…" : "A little help, a little further."}
            </span>
          </div>
          <div className={styles.actions}>
            {turns.length > 0 && (
              <button
                type="button"
                disabled={busy}
                className={styles.iconButton}
                aria-label="New conversation"
                title="New conversation"
                onClick={() => {
                  setTurns([]);
                  inputRef.current?.focus();
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Minimize"
              title="Minimize · Esc"
              onClick={() => toggle(false)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        </header>

        <div ref={scrollRef} className={styles.conversation}>
          {turns.length === 0 ? (
            <div className={styles.welcome}>
              <span className={styles.welcomeSparkle} aria-hidden="true">
                <Sparkle />
              </span>
              <h3>
                A small nudge.
                <br />
                <span>A new possibility.</span>
              </h3>
              <p>What would you like to explore for {child}?</p>
              <div className={styles.starters}>
                {starters.map(({ label, detail }) => (
                  <button key={label} type="button" onClick={() => send(detail)}>
                    <span>{label}</span>
                    <small>{detail}</small>
                    <span className={styles.starterArrow} aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <StageContext.Provider value={stage}>
            <div className={styles.turns} role="log" aria-label="Answers" aria-live="polite">
              {turns.map((turn) => (
                <section key={turn.id} className={styles.turn} data-latest={turn === latest}>
                  <p className={styles.prompt}>
                    <span aria-hidden="true">↳</span> {turn.prompt}
                  </p>
                  {turn.status === "error" ? (
                    <div className={styles.error} role="alert">
                      <p>{turn.error}</p>
                      <button type="button" disabled={busy} onClick={() => retry(turn)}>
                        Try again ↗
                      </button>
                    </div>
                  ) : (
                    <Result turn={turn} focus={focus} child={child} />
                  )}
                </section>
              ))}
            </div>
            </StageContext.Provider>
          )}
        </div>
        <footer className={styles.footer}>
          <span>Built around {child}&apos;s learning</span>
          <span>Esc to tuck away</span>
        </footer>
        <div ref={waveRef} className={styles.revealWave} aria-hidden="true">
          <div />
        </div>
      </section>

      <form
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
          <Sparkle />
        </button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a question, or tell me what’s next…"
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4" />
          </svg>
        </button>
      </form>
    </div>
  );
}
