"use client";

import { useEffect, useRef, useState } from "react";
import { CHANNELS } from "./channels";
import { DoraPlayer } from "./lab/player";
import { subscribeToPlan } from "../lib/parent/subscribe";
import s from "./play.module.css";

// Languages the kid can practise (answers are taught in them after each question).
const LANGUAGES = [
  { code: "", flag: "🇺🇸", name: "English" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "zh", flag: "🇨🇳", name: "中文" },
  { code: "hi", flag: "🇮🇳", name: "हिन्दी" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
];

const STATIC_MS = 450;
const OSD_MS = 2500;

// Kid view: a retro wooden TV. Channel 1 is the interactive Dora show (it pauses, asks, listens with the mic
// always on, and answers); the other channels are coming soon. Press ` for the hidden dev drawer.
const channelOsd = (i: number) =>
  `CH ${String(i + 1).padStart(2, "0")}  ${CHANNELS[i]!.name.toUpperCase()}`;

export default function Play() {
  const [on, setOn] = useState(false);
  const [ch, setCh] = useState(0);
  const [tuning, setTuning] = useState(false);
  const [osd, setOsd] = useState<string | null>(null); // on-screen display text (channel or language)
  const [learn, setLearn] = useState("");
  const [focus, setFocus] = useState<Record<string, string>>({});
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [playerControls, setPlayerControls] = useState<HTMLDivElement | null>(
    null,
  );
  const noise = useRef<HTMLCanvasElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const channel = CHANNELS[ch]!;

  function hiss() {
    const ctx = (audio.current ??= new AudioContext());
    const buf = ctx.createBuffer(
      1,
      ctx.sampleRate * (STATIC_MS / 1000),
      ctx.sampleRate,
    );
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  function tune(next: number) {
    if (!on) return;
    setCh((next + CHANNELS.length) % CHANNELS.length);
    setTuning(true);
    setOsd(channelOsd((next + CHANNELS.length) % CHANNELS.length));
    hiss();
  }

  function power() {
    setOn(!on);
    setOsd(on ? null : channelOsd(ch));
  }

  function pickLanguage(code: string) {
    setLearn(code);
    const l = LANGUAGES.find((x) => x.code === code)!;
    setOsd(`${l.flag} LEARN ${l.code ? l.name.toUpperCase() : "OFF"}`);
  }

  // The parent's learning plan (learning-plan.md): a language change lands mid-episode, at Dora's next line.
  useEffect(
    () =>
      subscribeToPlan(({ language, focus: nextFocus }) => {
        if (nextFocus) setFocus(nextFocus);
        const l = LANGUAGES.find((x) => x.code === language);
        if (!l) return; // unset or unknown: keep what the kid picked
        setLearn(l.code);
        setOsd(`${l.flag} LEARN ${l.code ? l.name.toUpperCase() : "OFF"}`);
      }) ?? undefined,
    [],
  );

  // Static snow while tuning.
  useEffect(() => {
    if (!tuning) return;
    const c = noise.current!.getContext("2d")!;
    const img = c.createImageData(160, 120);
    let raf = 0;
    const draw = () => {
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      raf = requestAnimationFrame(draw);
    };
    draw();
    const t = setTimeout(() => setTuning(false), STATIC_MS);
    return () => (cancelAnimationFrame(raf), clearTimeout(t));
  }, [tuning, ch]);

  useEffect(() => {
    if (!osd) return;
    const t = setTimeout(() => setOsd(null), OSD_MS);
    return () => clearTimeout(t);
  }, [osd]);

  // Remote control: arrows flip channels, number keys jump, P is power.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("input, textarea, select")
      )
        return; // typing in the dev drawer
      if (e.key === "ArrowUp" || e.key === "ArrowRight") tune(ch + 1);
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") tune(ch - 1);
      else if (e.key.toLowerCase() === "p") power();
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= CHANNELS.length)
        tune(Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className={s.room}>
      <div className={s.tv}>
        <div className={s.cabinet}>
          <div
            className={`${s.screen} ${on ? s.on : s.off}`}
            style={{ ["--glow" as string]: channel.color }}
          >
            {on && channel.id === "dora" && (
              <div className={s.player}>
                <DoraPlayer
                  kid
                  learn={learn}
                  onLearnChange={setLearn}
                  controlsTarget={playerControls}
                  captionsEnabled={captionsEnabled}
                  learningFocus={focus}
                />
              </div>
            )}
            {on && channel.id !== "dora" && (
              <div className={s.soon} style={{ background: channel.color }}>
                <span className={s.soonBounce}>★</span>
                <strong>{channel.name}</strong>
                <span>is coming soon!</span>
              </div>
            )}
            {on && tuning && (
              <canvas ref={noise} width={160} height={120} className={s.snow} />
            )}
            {on && osd && (
              <div className={s.osd} aria-live="polite">
                {osd}
              </div>
            )}
            {!on && (
              <p className={s.powerHint}>
                Ready when you are.<span>Turn on the TV to watch.</span>
              </p>
            )}
            <div className={s.glass} />
          </div>
        </div>
        <div className={s.legs}>
          <span />
          <span />
        </div>
      </div>

      <aside className={s.sidebar} aria-label="TV controls">
        <p className={s.brand}>tellavision</p>
        <button className={s.power} onClick={power} aria-pressed={on}>
          <span aria-hidden>⏻</span> Turn TV {on ? "off" : "on"}
        </button>

        <nav className={s.remote} aria-label="Channels">
          <h2 className={s.label}>Channels</h2>
          {CHANNELS.map((c, i) => (
            <button
              key={c.id}
              className={`${s.chip} ${i === ch && on ? s.active : ""}`}
              style={{ background: c.color }}
              aria-pressed={i === ch && on}
              onClick={() => (on ? tune(i) : (setCh(i), power()))}
            >
              <b>{i + 1}</b>
              {c.name}
            </button>
          ))}
          <div className={s.channelSteps}>
            <button
              className={s.arrow}
              aria-label="Channel down"
              onClick={() => tune(ch - 1)}
              disabled={!on}
            >
              ▼
            </button>
            <button
              className={s.arrow}
              aria-label="Channel up"
              onClick={() => tune(ch + 1)}
              disabled={!on}
            >
              ▲
            </button>
          </div>
        </nav>

        <nav className={s.languages} aria-label="Language to learn">
          <h2 className={s.label}>Learn a language</h2>
          {LANGUAGES.map((l) => (
            <button
              key={l.code || "en"}
              className={`${s.lang} ${learn === l.code ? s.active : ""}`}
              aria-pressed={learn === l.code}
              onClick={() => pickLanguage(l.code)}
            >
              <span aria-hidden>{l.flag}</span> {l.name}
            </button>
          ))}
        </nav>
        <div className={s.playbackControls}>
          <button
            className={s.cc}
            aria-label="Closed captions"
            aria-pressed={captionsEnabled}
            onClick={() => setCaptionsEnabled((enabled) => !enabled)}
          >
            <span className={s.ccMark} aria-hidden>
              CC
            </span>{" "}
            {captionsEnabled ? "On" : "Off"}
          </button>
          <div ref={setPlayerControls} />
        </div>
      </aside>
    </main>
  );
}
