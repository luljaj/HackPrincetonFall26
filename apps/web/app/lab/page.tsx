"use client";

import { useEffect, useRef, useState } from "react";
import { INITIAL, MAX_NUDGES, MAX_TRIES, STAGES, next, type Ctx, type Event, type Stage } from "./machine";
import { Graph } from "./graph";
import lines from "./lines.json";
import spotsData from "./spots.json";
import trialEpisode from "./episode.json";
import s from "./lab.module.css";
import { streamVoice } from "./voice";

// Episode 3 with every detected question spot. Spots come from tools-side detection (spots.json);
// `custom` spots have hand-written lines, every other spot uses the generic g_* lines.
type Spot = {
  id: string;
  t: number; // question starts
  pauseAt: number; // question ends: freeze here
  resumeAt: number; // show's next line: continue here
  gap: number; // how long the show itself waits
  text: string;
  talk: [number, number]; // episode range looped while Dora talks
  wait: [number, number]; // episode range looped while she listens
  custom?: boolean;
};
const SPOTS = spotsData as Spot[];
const EPISODE = trialEpisode.src;
const DURATION = trialEpisode.durationSeconds;
const FADE_MS = 300;
const THINK_MS = 900; // stand-in for the pipeline round trip
const TALK_RMS = 0.03; // mouth-open threshold, about -30 dB (calibration knob: retune per voice)
const MOUTH_HOLD_MS = 350; // keep talking through gaps between words; swap loops per phrase, not per syllable
const LIKELY_GAP = 1.5; // the show waits at least this long at a real audience pause
const LINES: Record<string, string> = lines; // same file the voice generator reads
const FIREHOUSE = SPOTS.find((sp) => sp.custom) ?? SPOTS[0]!;

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// Which audio file a stage plays at this spot. null = no line (generic spots: the show already asked).
function lineFor(stage: Stage, spot: Spot, tries: number): string | null {
  let base = STAGES[stage].line;
  if (!base) return null;
  if (base === "teach") base = `teach${Math.min(Math.max(tries, 1), 2)}`;
  if (spot.custom || base === "graceful") return base;
  if (base === "ask") return null;
  return `g_${base}`;
}

const KID: { label: string; result: Event | "SILENCE" }[] = [
  { label: "Answers right", result: "CORRECT" },
  { label: "Answers wrong", result: "WRONG" },
  { label: "Mumbles", result: "UNCLEAR" },
  { label: "Stays silent", result: "SILENCE" },
  { label: "Pipeline breaks", result: "ERROR" },
];

type Loop = "talk" | "wait";

export default function Lab() {
  const [ctx, setCtx] = useState<Ctx>(INITIAL);
  const [started, setStarted] = useState(false);
  const [spot, setSpot] = useState<Spot>(FIREHOUSE);
  const [autoPause, setAutoPause] = useState(true);
  const [likelyOnly, setLikelyOnly] = useState(false);
  const [localVoice, setLocalVoice] = useState(true);
  const [voiceText, setVoiceText] = useState("Hola! A bigger number on the bottom means smaller pieces. Shall we try again?");
  const [voiceError, setVoiceError] = useState("");
  const [voiceMetrics, setVoiceMetrics] = useState("");
  const [speechVersion, setSpeechVersion] = useState(0);
  const [speechCaption, setSpeechCaption] = useState<string | null>(null);
  const liveText = useRef<string | null>(null);
  const liveSpeaking = useRef(false);
  const voiceMode = useRef(localVoice);
  voiceMode.current = localVoice;
  const [log, setLog] = useState<string[]>([]);
  const ctxRef = useRef(ctx);
  const spotRef = useRef(spot);
  const autoRef = useRef(autoPause);
  const lastResumed = useRef<string | null>(null);
  const pending = useRef<Event>("CORRECT");
  const episode = useRef<HTMLVideoElement>(null);
  const line = useRef<HTMLAudioElement>(null);
  const loops = useRef<Record<Loop, HTMLVideoElement | null>>({ talk: null, wait: null });
  const audio = useRef<{ ctx: AudioContext; epGain: GainNode; analyser: AnalyserNode } | null>(null);
  const stage = ctx.stage;
  const meta = STAGES[stage];
  autoRef.current = autoPause;

  function commit(n: Ctx, label: string) {
    ctxRef.current = n;
    setCtx(n);
    const t = episode.current ? fmt(episode.current.currentTime) : "00:00.0";
    setLog((l) => [`${t}  ${label} → ${n.stage}`, ...l].slice(0, 40));
  }

  function send(e: Event) {
    const n = next(ctxRef.current, e);
    if (n !== ctxRef.current) commit(n, e);
  }

  function force(st: Stage) {
    commit({ ...ctxRef.current, stage: st }, "forced");
  }

  function pickSpot(sp: Spot) {
    spotRef.current = sp;
    setSpot(sp);
    ctxRef.current = { ...ctxRef.current, known: !!sp.custom };
  }

  function jump(sp: Spot) {
    if (!started) return;
    pickSpot(sp);
    lastResumed.current = null;
    episode.current!.currentTime = Math.max(0, sp.t - 2);
    commit({ ...INITIAL, known: !!sp.custom }, `jump ${sp.id}`);
    episode.current!.play();
  }

  function fadeEpisode(to: number) {
    const a = audio.current;
    if (!a) return;
    const g = a.epGain.gain;
    g.cancelScheduledValues(a.ctx.currentTime);
    g.setValueAtTime(g.value, a.ctx.currentTime);
    g.linearRampToValueAtTime(to, a.ctx.currentTime + FADE_MS / 1000);
  }

  function start() {
    const ctx = new AudioContext();
    const epGain = ctx.createGain();
    ctx.createMediaElementSource(episode.current!).connect(epGain).connect(ctx.destination);
    const analyser = ctx.createAnalyser();
    ctx.createMediaElementSource(line.current!).connect(analyser).connect(ctx.destination);
    audio.current = { ctx, epGain, analyser };
    Object.values(loops.current).forEach((v) => v?.play());
    setStarted(true);
  }

  // Jump to the firehouse once audio is wired up.
  useEffect(() => {
    if (started) jump(FIREHOUSE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on start
  }, [started]);

  // Side effects of entering each stage.
  useEffect(() => {
    if (!started) return;
    const ep = episode.current!;
    const ln = line.current!;
    const sp = spotRef.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    const speechAbort = new AbortController();
    setSpeechCaption(null);

    if (stage === "watching") {
      fadeEpisode(1);
      ep.play();
      // Freeze at whichever spot the playhead crosses.
      const watch = () => {
        const hit = autoRef.current
          ? SPOTS.find((x) => ep.currentTime >= x.pauseAt && ep.currentTime < x.pauseAt + 0.5 && x.id !== lastResumed.current)
          : undefined;
        if (hit) {
          pickSpot(hit);
          send("PAUSE_POINT");
        } else raf = requestAnimationFrame(watch);
      };
      watch();
    } else {
      ep.pause();
      fadeEpisode(0);
    }

    if (stage === "entering") {
      // Freeze exactly on the pause frame: the wait loop starts on that same frame, so the crossfade is invisible.
      ep.currentTime = sp.pauseAt;
      for (const el of Object.values(loops.current)) if (el) el.currentTime = 0;
      timers.push(setTimeout(() => send("TRANSITION_DONE"), FADE_MS));
    }
    if (stage === "exiting") {
      // Don't fade back until the episode has actually landed on the resume frame (remote seeks take a moment).
      lastResumed.current = sp.id;
      const done = () => timers.push(setTimeout(() => send("TRANSITION_DONE"), FADE_MS));
      ep.addEventListener("seeked", done, { once: true });
      ep.currentTime = sp.resumeAt;
      timers.push(setTimeout(() => ep.removeEventListener("seeked", done), 5000));
    }
    if (stage === "thinking") timers.push(setTimeout(() => send(pending.current), THINK_MS));
    if (meta.line) {
      const file = lineFor(stage, sp, ctxRef.current.tries);
      if (file) {
        const customText = liveText.current;
        liveText.current = null;
        const text = customText ?? LINES[file];
        setSpeechCaption(text ?? null);
        setVoiceError("");
        if ((voiceMode.current || customText !== null) && text) {
          const a = audio.current!;
          void streamVoice({
            text, context: a.ctx, destination: a.analyser, signal: speechAbort.signal,
            onSpeaking: (speaking) => { if (!speechAbort.signal.aborted) liveSpeaking.current = speaking; },
            onMetrics: ({ firstAudioSeconds, generationSeconds }) => {
              if (!speechAbort.signal.aborted) setVoiceMetrics(`First audio ${firstAudioSeconds.toFixed(2)}s · generated in ${generationSeconds.toFixed(2)}s`);
            },
          }).then(() => {
            if (!speechAbort.signal.aborted) send("LINE_DONE");
          }).catch((error: unknown) => {
            if (speechAbort.signal.aborted) return;
            setVoiceError(error instanceof Error ? error.message : "Speech failed.");
            send("LINE_DONE");
          });
        } else {
          ln.src = `/media/lab/${file}.m4a`;
          ln.onended = () => send("LINE_DONE");
          ln.onerror = () => { setVoiceError("Saved voice line could not be loaded."); send("LINE_DONE"); };
          void ln.play().catch(() => { if (!speechAbort.signal.aborted) { setVoiceError("Audio playback failed."); send("LINE_DONE"); } });
        }
      } else timers.push(setTimeout(() => send("LINE_DONE"), 0)); // the show already asked
    }

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      liveSpeaking.current = false;
      speechAbort.abort();
      ln.onended = null;
      ln.onerror = null;
      ln.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per stage entry
  }, [stage, started, speechVersion]);

  // Mouth follows the voice: talk loop while she speaks (held through short gaps), wait loop otherwise.
  // Loops are pre-cut boomerang clips (tools/cut-loops.py), so <video loop> never seeks.
  useEffect(() => {
    if (!started) return;
    const a = audio.current!;
    const buf = new Float32Array(a.analyser.fftSize);
    let raf = 0;
    let openUntil = 0;
    let shown: Loop = "wait";
    const tick = (now: number) => {
      a.analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((sum, x) => sum + x * x, 0) / buf.length);
      const speaking = !line.current!.paused || liveSpeaking.current;
      if (speaking && rms > TALK_RMS) openUntil = now + MOUTH_HOLD_MS;
      const show: Loop = speaking && now < openUntil ? "talk" : "wait";
      if (show !== shown) {
        shown = show;
        for (const n of ["talk", "wait"] as Loop[]) {
          const el = loops.current[n];
          if (el) el.style.opacity = n === show ? "1" : "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  const file = lineFor(stage, spot, ctx.tries);
  const caption = file ? (speechCaption ?? LINES[file]) : stage === "listening" ? `🎤 listening… “${spot.text.slice(-70)}”` : stage === "thinking" ? "…" : "";
  const shown = likelyOnly ? SPOTS.filter((x) => x.gap >= LIKELY_GAP) : SPOTS;

  return (
    <main className={s.lab}>
      <section className={s.stageWrap}>
        <div className={s.screen}>
          <video ref={episode} crossOrigin="anonymous" src={EPISODE} playsInline preload="auto" className={s.layer} />
          <div className={`${s.layer} ${s.assistant} ${meta.assistant ? s.show : ""}`}>
            {(["wait", "talk"] as Loop[]).map((n) => (
              <video
                key={n}
                ref={(el) => {
                  loops.current[n] = el;
                }}
                src={`/media/loops/${spot.id}-${n}.mp4`}
                muted
                loop
                autoPlay
                playsInline
                preload="auto"
                className={`${s.layer} ${s.loop}`}
                style={{ opacity: n === "wait" ? 1 : 0 }}
              />
            ))}
            {stage === "listening" && <div className={s.listenRing} />}
          </div>
          {stage === "away" && <div className={`${s.layer} ${s.away}`}>📺 Another channel…</div>}
          {caption && <p className={s.caption}>{caption}</p>}
          {!started && (
            <button className={s.start} onClick={start}>
              ▶ Start
            </button>
          )}
        </div>

        <div className={s.kid}>
          <span>The kid…</span>
          {KID.map((k) => (
            <button
              key={k.label}
              disabled={stage !== "listening"}
              onClick={() => {
                if (k.result === "SILENCE") return send("SILENCE");
                pending.current = k.result;
                send("SPEECH_END");
              }}
            >
              {k.label}
            </button>
          ))}
          <button disabled={!started} onClick={() => send(stage === "away" ? "BACK" : "AWAY")}>
            {stage === "away" ? "↩ Come back" : "📺 Switch channel"}
          </button>
        </div>

        <div className={s.timeline} aria-label="Question spots">
          {SPOTS.map((x) => (
            <button
              key={x.id}
              title={`${fmt(x.t)} · waits ${x.gap}s · ${x.text}`}
              className={`${s.mark} ${x.gap >= LIKELY_GAP ? s.likely : ""} ${x.id === spot.id ? s.here : ""}`}
              style={{ left: `${(x.t / DURATION) * 100}%` }}
              onClick={() => jump(x)}
            />
          ))}
        </div>
        <div className={s.spotBar}>
          <label>
            <input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} /> Pause at every spot
          </label>
          <label>
            <input type="checkbox" checked={likelyOnly} onChange={(e) => setLikelyOnly(e.target.checked)} /> Only spots where the show waits ≥{LIKELY_GAP}s
          </label>
          <span>
            {shown.length}/{SPOTS.length} spots
          </span>
        </div>
        <ol className={s.spots}>
          {shown.map((x) => (
            <li key={x.id}>
              <button className={x.id === spot.id ? s.here : ""} disabled={!started} onClick={() => jump(x)}>
                <b>{fmt(x.t)}</b>
                <i className={x.gap >= LIKELY_GAP ? s.likelyText : ""}>waits {x.gap}s</i>
                {x.custom && <em>custom lines</em>}
                <span>{x.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <aside className={s.panel}>
        <h2>Character voice</h2>
        <label><input type="checkbox" checked={localVoice} onChange={(e) => setLocalVoice(e.target.checked)} /> Generate lines live</label>
        <form onSubmit={(e) => {
          e.preventDefault();
          liveText.current = voiceText.trim();
          force("teaching");
          setSpeechVersion((v) => v + 1);
        }}>
          <label htmlFor="voice-text">Try a personalized reply</label>
          <textarea id="voice-text" value={voiceText} maxLength={600} rows={4} onChange={(e) => setVoiceText(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
          <button disabled={!started || !voiceText.trim()} type="submit">Speak reply</button>
          <button disabled={!started} type="button" onClick={() => { liveText.current = null; force("listening"); }}>Stop speaking</button>
        </form>
        {voiceError && <p role="alert">{voiceError}</p>}
        {voiceMetrics && <p className={s.meta}>{voiceMetrics}</p>}
        <h2>Stage machine</h2>
        <Graph ctx={ctx} onEvent={send} onForce={force} disabled={!started} />
        <p className={s.meta}>
          {spot.id} · stage <b>{stage}</b> · tries {ctx.tries}/{MAX_TRIES} · nudges {ctx.nudges}/{MAX_NUDGES}
        </p>

        <h2>Log</h2>
        <ol className={s.log}>
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      </aside>
      <audio ref={line} preload="auto" />
    </main>
  );
}
