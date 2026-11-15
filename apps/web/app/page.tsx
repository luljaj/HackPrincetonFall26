"use client";

import { useEffect, useRef, useState } from "react";
import { CHANNELS } from "./channels";
import s from "./play.module.css";

const STATIC_MS = 450;
const OSD_MS = 2500;
const AMBIENT_MS = 200; // how often the wall glow and side fill re-sample the picture

export default function Play() {
  const [on, setOn] = useState(false);
  const [ch, setCh] = useState(0);
  const [tuning, setTuning] = useState(false);
  const [osd, setOsd] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const noise = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<HTMLCanvasElement>(null); // blurred picture filling the sides of the 4:3 show
  const ambient = useRef<HTMLCanvasElement>(null); // the same colors glowing on the wall behind the TV
  const audio = useRef<AudioContext | null>(null);
  const resumeAt = useRef<Record<string, number>>({}); // each channel picks up where you left it
  const channel = CHANNELS[ch]!;

  function hiss() {
    const ctx = (audio.current ??= new AudioContext());
    const buf = ctx.createBuffer(1, ctx.sampleRate * (STATIC_MS / 1000), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  function tune(next: number) {
    if (!on) return;
    if (video.current) resumeAt.current[channel.id] = video.current.currentTime;
    setCh((next + CHANNELS.length) % CHANNELS.length);
    setTuning(true);
    setOsd(true);
    hiss();
  }

  function power() {
    if (on && video.current) resumeAt.current[channel.id] = video.current.currentTime;
    setOn(!on);
    setOsd(!on);
  }

  // Static snow while tuning.
  useEffect(() => {
    if (!tuning) return;
    const c = noise.current!.getContext("2d")!;
    const img = c.createImageData(160, 90);
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
    const t = setTimeout(() => setOsd(false), OSD_MS);
    return () => clearTimeout(t);
  }, [osd, ch]);

  // Sample the picture into two tiny canvases: CSS scales and blurs them into the side fill and wall glow.
  useEffect(() => {
    if (!on || !channel.src) {
      // No picture: wipe the last frame so the wall glows in the channel colour instead.
      const c = ambient.current;
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      return;
    }
    const id = setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      for (const c of [backdrop.current, ambient.current]) c?.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    }, AMBIENT_MS);
    return () => clearInterval(id);
  }, [on, channel.src]);

  // Remote control: arrows flip channels, number keys jump, P is power.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") tune(ch + 1);
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") tune(ch - 1);
      else if (e.key.toLowerCase() === "p") power();
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= CHANNELS.length) tune(Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const picture = on && !!channel.src;
  return (
    <main className={s.room} style={{ ["--ch" as string]: channel.color }}>
      <div className={s.stage}>
        <canvas ref={ambient} width={32} height={18} className={`${s.ambient} ${picture ? s.lit : on ? s.tinted : ""}`} aria-hidden />

        <div className={s.tv}>
          <div className={`${s.screen} ${on ? s.on : s.off} ${picture ? s.picture : ""}`}>
            {picture && <canvas ref={backdrop} width={32} height={18} className={s.backdrop} aria-hidden />}
            {picture && (
              <video
                key={channel.id}
                ref={video}
                src={channel.src}
                autoPlay
                playsInline
                onLoadedMetadata={(e) => (e.currentTarget.currentTime = resumeAt.current[channel.id] ?? 0)}
              />
            )}
            {on && !channel.src && (
              <div className={s.soon}>
                <span className={s.star} aria-hidden>★</span>
                <strong>{channel.name}</strong>
                <span>is coming soon!</span>
              </div>
            )}
            {on && tuning && <canvas ref={noise} width={160} height={90} className={s.snow} aria-hidden />}
            {on && osd && (
              <div className={s.osd} aria-live="polite">
                <i aria-hidden />CH {String(ch + 1).padStart(2, "0")} <span>{channel.name}</span>
              </div>
            )}
            {!on && (
              <button className={s.powerOn} onClick={power}>
                <span aria-hidden>⏻</span> Turn on TV
              </button>
            )}
            <div className={s.glass} aria-hidden />
          </div>
          <div className={s.chin}>
            <span className={s.brand}>PLAY</span>
            <button className={`${s.led} ${on ? s.ledOn : ""}`} aria-label={on ? "Turn TV off" : "Turn TV on"} onClick={power} />
          </div>
        </div>
        <div className={s.stand} aria-hidden />
      </div>

      <nav className={s.dock} aria-label="Channels">
        <div className={s.bars} aria-hidden>
          {CHANNELS.map((c) => <i key={c.id} style={{ background: c.color }} />)}
        </div>
        <button className={s.arrow} aria-label="Channel down" onClick={() => tune(ch - 1)}>‹</button>
        <div className={s.chips}>
          {CHANNELS.map((c, i) => (
            <button
              key={c.id}
              className={`${s.chip} ${i === ch && on ? s.active : ""}`}
              style={{ ["--c" as string]: c.color }}
              aria-current={i === ch && on ? "true" : undefined}
              onClick={() => (on ? tune(i) : (setCh(i), power()))}
            >
              <b>{i + 1}</b>
              {c.name}
            </button>
          ))}
        </div>
        <button className={s.arrow} aria-label="Channel up" onClick={() => tune(ch + 1)}>›</button>
      </nav>
    </main>
  );
}
