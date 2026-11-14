"use client";

import { useEffect, useRef, useState } from "react";
import { INITIAL, MAX_NUDGES, MAX_TRIES, STAGES, next, type Ctx, type Event, type Stage } from "./machine";
import { Graph } from "./graph";
import lines from "./lines.json";
import spotsData from "./spots.json";
import lessonsData from "./lessons.json";
import translationsData from "./translations.json";
import trialEpisode from "./episode.json";
import s from "./lab.module.css";
import { speakFallback, streamVoice } from "./voice";
import { listenOnce, openMic, recorderOptions } from "./listen";
import { clearlyCorrect } from "./quick-judge";

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
  answer?: string; // custom spots: what Luna judges against
  accept?: string[]; // answers clear enough to celebrate instantly, without waiting for Luna
  say?: { word: string; language: string; ipa: string }; // "say X" spots: scored for pronunciation
  question?: string; // what Dora asks the kid here (from lessons.json): the show often doesn't ask clearly
  open?: boolean; // opinion/imagination question: any sensible answer is right
  visual?: boolean; // the kid needs to see the scene to answer: keep it on screen instead of Dora's close-up
  keep?: boolean;
};
type Lesson = {
  keep: boolean; visual: boolean; question: string; type: "answer" | "say" | "open" | "choice" | "count"; answer: string; accept: string[];
  say_word: string | null; say_language: string | null; say_ipa: string | null;
};
type Pronunciation = { verdict: "good" | "close" | "retry" | "silent"; heard: string; target: string; coach: { expected: string; heard: string } | null; ms: number };
const RECORD_MS = 4000; // the scorer's window
// Each spot gets its lesson (tools/build-lessons.py). Hand-written fields in spots.json win.
const LESSONS = lessonsData as Record<string, Lesson>;
const SPOTS = (spotsData as Spot[]).map((sp): Spot => {
  const l = LESSONS[sp.id];
  if (!l) return sp;
  const open = l.type === "open";
  return {
    ...sp,
    question: sp.custom ? undefined : l.question,
    keep: l.keep,
    visual: l.visual,
    open,
    answer: sp.answer ?? (open ? undefined : l.answer),
    accept: sp.accept ?? (l.accept.length ? l.accept : undefined),
    say: sp.say ?? (l.type === "say" && l.say_word && l.say_language && l.say_ipa ? { word: l.say_word, language: l.say_language, ipa: l.say_ipa } : undefined),
  };
});
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

// Language practice: the spot's answer in the language the kid is learning (tools/build-translations.py).
const LEARN_LANGUAGES: Record<string, string> = { es: "Spanish", fr: "French", de: "German", zh: "Chinese", hi: "Hindi", ja: "Japanese" };
type Word = { word: string; romanized: string; ipa: string };
type Practice = Word & { english: string; language: string; name: string };
const TRANSLATIONS = translationsData as unknown as Record<string, { english: string } & Record<string, Word>>;
function practiceFor(sp: Spot, language: string): Practice | null {
  const t = TRANSLATIONS[sp.id];
  const w = language && t ? (t[language] as Word | undefined) : undefined;
  return w && t ? { ...w, english: t.english, language, name: LEARN_LANGUAGES[language] ?? language } : null;
}
// Non-Latin words also get their romanization, e.g. 梯子 (tīzi).
const spoken = (p: Practice) => (p.romanized && p.romanized !== p.word ? `${p.word} (${p.romanized})` : p.word);

// Dora's lines built from the spot's lesson, for spots without hand-written lines. No saved audio exists
// for these, so they're spoken live (voice server, or the browser voice when it's off).
function lessonText(stage: Stage, sp: Spot, practiced = false, practice: Practice | null = null): string | null {
  if (practice) {
    if (stage === "practicing") return `In ${practice.name}, ${practice.english} is ${spoken(practice)}! Can you say ${practice.word}?`;
    if (practiced && stage === "celebrating") return `Yes! ${practice.word}! You said it in ${practice.name}!`;
    if (practiced && stage === "giving") return `${spoken(practice)}! That's ${practice.english} in ${practice.name}. Great try!`;
  }
  if (sp.custom || !sp.question) return null;
  const q = sp.question;
  const target = sp.say?.word ?? sp.answer;
  switch (stage) {
    case "asking": return q;
    case "nudging": return `Take your time! ${q}`;
    case "clarifying": return `Oops, I didn't hear you. ${q}`;
    case "welcome": return `Ayyy, you're back! ${q}`;
    case "modeling": return target && !sp.open ? (sp.say ? `Listen: ${target}! Now you say it!` : `It's ${target}! Can you say ${target}?`) : null;
    case "giving": return target && !sp.open ? `It's ${target}! Let's see what happens!` : "Great thinking! Let's see what happens!";
    default: return null;
  }
}

const isKnown = (sp: Spot) => !!(sp.custom || sp.say || (sp.answer && !sp.open));
const askedText = (sp: Spot) => sp.question ?? (sp.custom ? LINES.ask : undefined) ?? sp.text;

// What the machine will do next, in words Luna can write a fitting line for.
function outcome(c: Ctx): string {
  switch (c.stage) {
    case "celebrating": return "celebrate the right answer";
    case "teaching": return c.tries <= 1 ? "give a gentle clue without revealing the answer, then re-ask" : "offer two choices, one of them right, then re-ask";
    case "modeling": return "say the answer and ask the child to repeat it";
    case "giving": return "warmly reveal the answer and move on with the story; no question";
    case "clarifying": return "say you didn't catch that and re-ask simply";
    default: return "say a short warm line";
  }
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
  const [localVoice, setLocalVoice] = useState(false); // saved lines start instantly; Luna's own lines are still generated live
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
  const pending = useRef<Event | null>("CORRECT"); // null = Luna is deciding
  const [kidText, setKidText] = useState("");
  const [judgeInfo, setJudgeInfo] = useState("");
  const [pron, setPron] = useState<Pronunciation | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const [learn, setLearn] = useState(""); // language the kid is learning ("" = off)
  const learnRef = useRef(learn);
  learnRef.current = learn;
  const [hearing, setHearing] = useState(false);
  const [mic, setMic] = useState<MediaStream | null>(null); // one stream for the whole hands-free session
  const [listenKey, setListenKey] = useState(0); // bump to re-arm the mic after a failed turn
  const [loopInfo, setLoopInfo] = useState("");
  const [heardInfo, setHeardInfo] = useState("");
  // Turn-gap timing from the kid's last sound: when Dora's first sound (the "Hmm!") and her answer started.
  const gap = useRef<{ from: number; first: number | null } | null>(null);
  const synthSpeaking = useRef(false);
  const turn = useRef(0); // bumped on every new turn, jump or forced stage: late replies from older turns are dropped
  const episode = useRef<HTMLVideoElement>(null);
  const line = useRef<HTMLAudioElement>(null);
  const filler = useRef<HTMLAudioElement>(null); // its own element: stage changes pause `line`, which would cut the "Hmm!" off
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

  function doraStartedSpeaking() {
    const g = gap.current;
    if (!g) return;
    const ms = Math.round(performance.now() - g.from);
    setLoopInfo(`Kid stopped → Dora's first sound ${g.first ?? ms} ms · her answer ${ms} ms`);
    gap.current = null;
  }

  // A quick "Hmm!" the moment the kid stops, the way people acknowledge before answering.
  function playFiller() {
    const el = filler.current!;
    const started = () => { if (gap.current && gap.current.first === null) gap.current.first = Math.round(performance.now() - gap.current.from); };
    // Only Dora's own saved "Hmm" (tools/gen-voice-lines.py --only hmm). A different voice saying it
    // right before Dora answers sounds like two people, so without the file there's no filler.
    el.onplaying = started;
    if (el.error) return;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  }

  // Hands-free end of turn: think out loud, then judge. Clear answers skip Luna entirely.
  function onKidDone(clip: Blob, lastSpeechAt: number) {
    gap.current = { from: lastSpeechAt, first: null };
    pending.current = null;
    send("SPEECH_END");
    playFiller();
    if (sayTarget()) void scoreClip(clip);
    else void transcribeAndJudge(clip);
  }

  // What the kid should say right now, if it's a "say" turn: the practice word, or the spot's say word.
  function sayTarget(): { word: string; language: string; ipa: string } | undefined {
    const p = ctxRef.current.practiced ? practiceFor(spotRef.current, learnRef.current) : null;
    return p ? { word: p.word, language: p.language, ipa: p.ipa } : spotRef.current.say;
  }

  // A listening step failed: go back to listening (the mic re-arms).
  function backToListening(why: string) {
    setJudgeInfo(why);
    if (ctxRef.current.stage === "thinking") commit({ ...ctxRef.current, stage: "listening" }, "retry listening");
    else setListenKey((k) => k + 1);
  }

  const answering = () => ["listening", "thinking"].includes(ctxRef.current.stage);

  function onSynth(on: boolean) {
    synthSpeaking.current = on;
    if (on) doraStartedSpeaking();
  }

  // Hands-free: the kid's spoken answer → local Whisper → Luna.
  async function transcribeAndJudge(clip: Blob) {
    const sp = spotRef.current;
    const form = new FormData();
    form.append("audio", clip);
    // The question only, never the answer: priming Whisper with "seatbelt" would make it hear seatbelt.
    form.append("hint", askedText(sp).slice(-200));
    for (const l of new Set(["en", "es", sp.say?.language ?? "en", learnRef.current || "en"])) form.append("languages", l);
    const mine = ++turn.current;
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const out = await res.json();
      if (mine !== turn.current || !answering()) return;
      if (!res.ok) throw new Error(out.error ?? "Transcription failed.");
      setHeardInfo(`Heard “${out.text}” (${out.language ?? "silence"}) · transcribed in ${out.ms} ms`);
      if (clearlyCorrect(out.text, sp.accept ?? (sp.answer ? [sp.answer] : []))) {
        setJudgeInfo("Instant: clear answer, no Luna call");
        send("SPEECH_END");
        return send("CORRECT");
      }
      void askLuna(out.text);
    } catch (error) {
      if (mine !== turn.current) return;
      backToListening(error instanceof Error ? error.message : "Transcription failed.");
    }
  }

  // Kid's words → Luna picks the event and Dora's line in one tool call → machine switches.
  async function askLuna(said: string, pronunciation?: Pronunciation) {
    const sp = spotRef.current;
    const c = { ...ctxRef.current, stage: "thinking" as const };
    const ev = { correct: "CORRECT", wrong: "WRONG", unclear: "UNCLEAR" } as const;
    const mine = ++turn.current;
    pending.current = null;
    send("SPEECH_END");
    const started = performance.now();
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: askedText(sp).slice(-300),
          answerGuide: sayTarget() ? `The child should say "${sayTarget()!.word}" (${sayTarget()!.language}).`
            : sp.open ? "Open question: any sensible answer is right."
            : sp.answer ?? "Not given: judge from the question; the show reveals the answer next.",
          said,
          // Only the sound to model goes to Luna, so the line can't dwell on what the kid got wrong.
          pronunciation: pronunciation && { verdict: pronunciation.verdict, expected: pronunciation.coach?.expected ?? null },
          outcomes: { correct: outcome(next(c, "CORRECT")), wrong: outcome(next(c, "WRONG")), unclear: outcome(next(c, "UNCLEAR")) },
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Judge failed.");
      if (mine !== turn.current || ctxRef.current.stage !== "thinking") return; // kid left, or a newer turn started
      setJudgeInfo(`Luna: ${out.event} · ${out.skill} · ${out.ms} ms model / ${Math.round(performance.now() - started)} ms total`);
      liveText.current = out.say;
      setSpeechCaption(out.say); // so the saved generic line never flashes first
      send(ev[out.event as keyof typeof ev]);
    } catch (error) {
      if (mine !== turn.current) return;
      setJudgeInfo(error instanceof Error ? error.message : "Judge failed.");
      if (ctxRef.current.stage === "thinking") commit({ ...ctxRef.current, stage: "listening" }, "judge failed");
    }
  }

  // "Say X" spots: score the clip locally, then let Luna write the line for that verdict.
  async function scoreClip(clip: Blob) {
    const sp = spotRef.current;
    const target = sayTarget();
    if (!target || !answering()) return setJudgeInfo("Clip ignored: Dora wasn't listening anymore.");
    const form = new FormData();
    form.append("audio", clip);
    for (const [k, v] of Object.entries(target)) form.append(k, v);
    setPron(null);
    const mine = ++turn.current;
    try {
      const res = await fetch("/api/pronounce", { method: "POST", body: form });
      const out = await res.json();
      if (mine !== turn.current || !answering()) return setJudgeInfo("Clip ignored: a newer turn started."); // stale
      if (!res.ok) throw new Error(out.error ?? "Scoring failed.");
      setPron(out);
      // Good or silent needs no tailored line: answer instantly. Close or retry gets Luna's coaching.
      if (out.verdict === "good" || out.verdict === "silent") {
        setJudgeInfo(`Instant: pronunciation ${out.verdict}, no Luna call`);
        send("SPEECH_END");
        return send(out.verdict === "good" ? "CORRECT" : "UNCLEAR");
      }
      void askLuna(`(sounded like: ${out.heard})`, out);
    } catch (error) {
      if (mine !== turn.current) return;
      backToListening(error instanceof Error ? error.message : "Scoring failed.");
    }
  }

  async function toggleRecording() {
    if (recorder.current) return recorder.current.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, recorderOptions());
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setRecording(false);
        void scoreClip(new Blob(chunks, { type: rec.mimeType }));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), RECORD_MS);
    } catch {
      setJudgeInfo("Microphone unavailable. Use a clip instead.");
    }
  }

  function force(st: Stage) {
    turn.current++;
    commit({ ...ctxRef.current, stage: st }, "forced");
  }

  function pickSpot(sp: Spot) {
    spotRef.current = sp;
    setSpot(sp);
    ctxRef.current = { ...ctxRef.current, known: isKnown(sp), practice: !!practiceFor(sp, learnRef.current) };
  }

  function jump(sp: Spot) {
    if (!started) return;
    turn.current++;
    setPron(null);
    setJudgeInfo("");
    setHeardInfo("");
    setLoopInfo("");
    pickSpot(sp);
    lastResumed.current = null;
    episode.current!.currentTime = Math.max(0, sp.t - 2);
    commit({ ...INITIAL, known: isKnown(sp), practice: !!practiceFor(sp, learnRef.current) }, `jump ${sp.id}`);
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
    ctx.createMediaElementSource(filler.current!).connect(analyser); // same analyser: the mouth moves on "Hmm!" too
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
          ? SPOTS.find((x) => x.keep !== false && ep.currentTime >= x.pauseAt && ep.currentTime < x.pauseAt + 0.5 && x.id !== lastResumed.current)
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
    if (stage === "thinking" && pending.current) {
      const e = pending.current;
      timers.push(setTimeout(() => send(e), THINK_MS));
    }
    if (meta.line) {
      filler.current!.pause(); // never talk over her own "Hmm!"
      const file = lineFor(stage, sp, ctxRef.current.tries);
      const fromLesson = lessonText(stage, sp, ctxRef.current.practiced, practiceFor(sp, learnRef.current));
      if (file || fromLesson) {
        const customText = liveText.current;
        liveText.current = null;
        const text = customText ?? fromLesson ?? (file ? LINES[file] : undefined);
        setSpeechCaption(text ?? null);
        setVoiceError("");
        if ((voiceMode.current || customText !== null || fromLesson !== null) && text) {
          const a = audio.current!;
          void streamVoice({
            text, context: a.ctx, destination: a.analyser, signal: speechAbort.signal,
            onSpeaking: (speaking) => {
              if (speechAbort.signal.aborted) return;
              liveSpeaking.current = speaking;
              if (speaking) doraStartedSpeaking();
            },
            onMetrics: ({ firstAudioSeconds, generationSeconds }) => {
              if (!speechAbort.signal.aborted) setVoiceMetrics(`First audio ${firstAudioSeconds.toFixed(2)}s · generated in ${generationSeconds.toFixed(2)}s`);
            },
          }).then(() => {
            if (!speechAbort.signal.aborted) send("LINE_DONE");
          }).catch(async (error: unknown) => {
            if (speechAbort.signal.aborted) return;
            setVoiceError(`${error instanceof Error ? error.message : "Speech failed."} Using the browser voice.`);
            await speakFallback(text, speechAbort.signal, onSynth);
            if (!speechAbort.signal.aborted) send("LINE_DONE");
          });
        } else {
          ln.src = `/media/lab/${file}.m4a`;
          ln.onplaying = doraStartedSpeaking;
          ln.onended = () => send("LINE_DONE");
          ln.onerror = () => {
            setVoiceError("Saved voice line could not be loaded. Using the browser voice.");
            void speakFallback(text ?? "", speechAbort.signal, onSynth)
              .then(() => { if (!speechAbort.signal.aborted) send("LINE_DONE"); });
          };
          void ln.play().catch(() => { if (!speechAbort.signal.aborted) { setVoiceError("Audio playback failed."); send("LINE_DONE"); } });
        }
      } else timers.push(setTimeout(() => send("LINE_DONE"), 0)); // the show already asked
    }

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      liveSpeaking.current = false;
      synthSpeaking.current = false;
      speechAbort.abort();
      ln.onended = null;
      ln.onerror = null;
      ln.onplaying = null;
      ln.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per stage entry
  }, [stage, started, speechVersion]);

  // Hands-free on: open the mic once and keep it until hands-free is turned off.
  useEffect(() => {
    if (!started || !handsFree) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    openMic()
      .then((s) => {
        stream = s;
        if (cancelled) s.getTracks().forEach((t) => t.stop());
        else setMic(s);
      })
      .catch(() => setJudgeInfo("Microphone unavailable: allow mic access, or turn hands-free off."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setMic(null);
    };
  }, [started, handsFree]);

  // Hands-free: in the listening stage, wait for the kid's answer on the open mic.
  useEffect(() => {
    if (!mic || stage !== "listening") return;
    const abort = new AbortController();
    setHearing(false);
    listenOnce(mic, audio.current!.ctx, abort.signal, () => setHearing(true))
      .then((heard) => {
        if (abort.signal.aborted) return;
        setHearing(false);
        if (!heard.spoke || !heard.clip) return send("SILENCE");
        onKidDone(heard.clip, heard.lastSpeechAt);
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        setHearing(false);
        setJudgeInfo("Listening failed. Trying again on the next turn.");
      });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm per listening stage
  }, [stage, mic, listenKey]);

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
      const speaking = !line.current!.paused || !filler.current!.paused || liveSpeaking.current || synthSpeaking.current;
      // The browser voice can't be measured, so the mouth just talks while it speaks.
      if (speaking && (rms > TALK_RMS || synthSpeaking.current)) openUntil = now + MOUTH_HOLD_MS;
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
  const sayNow = ctx.practiced ? practiceFor(spot, learn) : spot.say; // what the record button scores
  const lineText = lessonText(stage, spot, ctx.practiced, practiceFor(spot, learn)) ?? (file ? LINES[file] : null);
  const caption = lineText ? (speechCaption ?? lineText)
    : stage === "listening" ? (hearing ? "🗣️ I'm listening…" : `🎤 ${askedText(spot)}`)
    : stage === "thinking" ? "…" : "";
  const shown = likelyOnly ? SPOTS.filter((x) => x.gap >= LIKELY_GAP) : SPOTS;

  return (
    <main className={s.lab}>
      <section className={s.stageWrap}>
        <div className={s.screen}>
          <video ref={episode} crossOrigin="anonymous" src={EPISODE} playsInline preload="auto" className={s.layer} />
          <div className={`${s.layer} ${s.assistant} ${meta.assistant && !spot.visual ? s.show : ""}`}>
            {(["wait", "talk"] as Loop[]).map((n) => (
              <video
                key={n}
                ref={(el) => {
                  loops.current[n] = el;
                }}
                src={spot.custom ? `/media/loops/${spot.id}-${n}.mp4` : `/media/loops/presenter-${n}.mp4`}
                muted
                loop
                autoPlay
                playsInline
                preload="auto"
                className={`${s.layer} ${s.loop}`}
                style={{ opacity: n === "wait" ? 1 : 0 }}
              />
            ))}
          </div>
          {stage === "listening" && <div className={s.listenRing} />}
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
          <label className={s.say}>
            <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> 🎙 Hands-free
          </label>
          <label className={s.say}>
            🌍 Learn
            <select value={learn} onChange={(e) => {
              setLearn(e.target.value);
              learnRef.current = e.target.value;
              ctxRef.current = { ...ctxRef.current, practice: !!practiceFor(spotRef.current, e.target.value) };
            }}>
              <option value="">off</option>
              {Object.entries(LEARN_LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <form onSubmit={(e) => { e.preventDefault(); void askLuna(kidText.trim()); setKidText(""); }}>
            <input value={kidText} maxLength={300} placeholder="Kid says… (Luna judges)" disabled={stage !== "listening"} onChange={(e) => setKidText(e.target.value)} />
            <button disabled={stage !== "listening"} type="submit">Say</button>
          </form>
          {sayNow && (
            <span className={s.say}>
              Say “{sayNow.word}”:
              <button disabled={stage !== "listening" && !recording} onClick={() => void toggleRecording()}>{recording ? "■ Stop" : "🎤 Record"}</button>
              <input type="file" accept="audio/*" aria-label="Score an audio clip" disabled={stage !== "listening"}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scoreClip(f); }} />
            </span>
          )}
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
        {judgeInfo && <p className={s.meta}>{judgeInfo}</p>}
        {heardInfo && <p className={s.meta}>{heardInfo}</p>}
        {loopInfo && <p className={s.meta}>{loopInfo}</p>}
        {pron && (
          <p className={s.meta}>
            Pronunciation: <b>{pron.verdict}</b> · heard /{pron.heard}/ vs /{pron.target}/
            {pron.coach && <> · coach {pron.coach.heard ? `/${pron.coach.heard}/ → /${pron.coach.expected}/` : `missing /${pron.coach.expected}/`}</>} · {pron.ms} ms
          </p>
        )}
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
      <audio ref={filler} src="/media/lab/hmm.m4a" preload="auto" />
    </main>
  );
}
