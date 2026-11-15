"use client";

import { useEffect, useRef, useState } from "react";
import { CHANNELS } from "./channels";
import s from "./play.module.css";

const SWITCH_MS = 700; // colour wipe + name, then the new show fades in
const IDLE_MS = 3000; // channel pills fade away while watching
const AMBIENT_MS = 250; // how often the soft glow re-samples the picture
const SWIPE_PX = 50;

export default function Play() {
  const [started, setStarted] = useState(false);
  const [ch, setCh] = useState(0);
  const [switching, setSwitching] = useState(0); // bumps on each switch to replay the animation
  const [idle, setIdle] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const ambient = useRef<HTMLCanvasElement>(null);
  const resumeAt = useRef<Record<string, number>>({}); // each channel picks up where you left it
  const swipeFrom = useRef<number | null>(null);
  const channel = CHANNELS[ch]!;

  function tune(next: number) {
    const target = (next + CHANNELS.length) % CHANNELS.length;
    if (target === ch) return;
    if (video.current) resumeAt.current[channel.id] = video.current.currentTime;
    setCh(target);
    setSwitching((n) => n + 1);
    wake();
  }

  // Any movement, tap or key brings the pills back; they hide again after a pause.
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function wake() {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  // Keys: arrows flip channels, number keys jump.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") tune(ch + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") tune(ch - 1);
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= CHANNELS.length) tune(Number(e.key) - 1);
      else wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A soft glow behind the picture in its own colours (or the channel colour when there's no show yet).
  useEffect(() => {
    const c = ambient.current;
    if (!started || !channel.src) {
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      return;
    }
    const id = setInterval(() => {
      const v = video.current;
      if (v && v.readyState >= 2 && c) c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    }, AMBIENT_MS);
    return () => clearInterval(id);
  }, [started, channel.src]);

  if (!started) {
    return (
      <main className={s.room}>
        <button className={s.start} onClick={() => (setStarted(true), wake())}>
          <span aria-hidden>▶</span> Let&apos;s watch
        </button>
      </main>
    );
  }

  return (
    <main
      className={`${s.room} ${idle ? s.idle : ""}`}
      style={{ ["--ch" as string]: channel.color, ["--switch" as string]: `${SWITCH_MS}ms` }}
      onPointerMove={wake}
      onPointerDown={(e) => { swipeFrom.current = e.clientX; wake(); }}
      onPointerUp={(e) => {
        const dx = swipeFrom.current === null ? 0 : e.clientX - swipeFrom.current;
        swipeFrom.current = null;
        if (Math.abs(dx) > SWIPE_PX) tune(dx < 0 ? ch + 1 : ch - 1);
      }}
    >
      <canvas ref={ambient} width={32} height={18} className={`${s.ambient} ${channel.src ? "" : s.tinted}`} aria-hidden />

      <div className={s.picture} key={`p${switching}`}>
        {channel.src ? (
          <video
            key={channel.id}
            ref={video}
            src={channel.src}
            autoPlay
            playsInline
            onLoadedMetadata={(e) => (e.currentTarget.currentTime = resumeAt.current[channel.id] ?? 0)}
          />
        ) : (
          <div className={s.soon}>
            <strong>{channel.name}</strong>
            <span>coming soon</span>
          </div>
        )}
      </div>

      {switching > 0 && (
        <div className={s.wipe} key={`w${switching}`} aria-hidden>
          <span className={s.wipeNumber}>{ch + 1}</span>
          <span className={s.wipeName}>{channel.name}</span>
        </div>
      )}

      <nav className={s.channels} aria-label="Channels">
        {CHANNELS.map((c, i) => (
          <button
            key={c.id}
            className={`${s.pill} ${i === ch ? s.active : ""}`}
            style={{ ["--c" as string]: c.color }}
            aria-current={i === ch ? "true" : undefined}
            onPointerDown={(e) => e.stopPropagation()} // a tap on a pill isn't a swipe
            onClick={() => tune(i)}
          >
            <b>{i + 1}</b>
            <span>{c.name}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
