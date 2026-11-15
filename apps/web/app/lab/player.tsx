"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { INITIAL, MAX_NUDGES, MAX_TRIES, STAGES, next, type Ctx, type Event, type Stage } from "./machine";
import { Graph } from "./graph";
import lines from "./lines.json";
import spotsData from "./spots.json";
import lessonsData from "./lessons.json";
import translationsData from "./translations.json";
import focusTranslations from "./focus-translations.json";
import loopsData from "./loops.json";
import trialEpisode from "./episode.json";
import s from "./lab.module.css";
import { afterRelease, canTake, silencesGreeting, type SoundOwner } from "./sound";
import { fetchVoice, captionFallback, streamVoice } from "./voice";
import dubsData from "./dubs.json";
import { listenOnce, openMic, recorderOptions } from "./listen";
import { localFlair } from "./flair";
import { clearlyCorrect } from "./quick-judge";
import { createTrace } from "./trace-client";
import type { RequestedLesson } from "../../lib/parent/subscribe";
import { additionLesson, wantsAddition } from "./focus-lessons";
import { skillOf } from "../../lib/play/mastery";
import policy from "./learning-policy.json";

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
  skill?: string;
  preparedLine?: string;
  practiceOnly?: boolean;
  practiceLine?: string;
};
type Lesson = {
  keep: boolean; asked: boolean; visual: boolean; question: string; type: "answer" | "say" | "open" | "choice" | "count"; answer: string; accept: string[];
  say_word: string | null; say_language: string | null; say_ipa: string | null; skill: string;
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
    keep: l.asked, // only the chosen pauses: worthwhile, answerable now, and spaced apart (build-lessons.py)
    skill: l.skill,
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
const THINK_MS = policy.playback.thinkingDelayMs;
const TALK_RMS = 0.03; // mouth-open threshold, about -30 dB (calibration knob: retune per voice)
const MOUTH_HOLD_MS = 350; // keep talking through gaps between words; swap loops per phrase, not per syllable
const RESUME_LEAD_S = 0.3; // come back in just before the next line so its first word isn't clipped
const LIKELY_GAP = 1.5; // the show waits at least this long at a real audience pause
const LINES: Record<string, string> = lines; // same file the voice generator reads
const strictnessOf = (sp: Spot) => policy.recall.skills.includes(skillOf(sp.id) ?? "") ? "recall" : "gentle";
const FIREHOUSE = SPOTS.find((sp) => sp.custom) ?? SPOTS[0]!;

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// Which audio file a stage plays at this spot. null = no line (generic spots: the show already asked).
function lineFor(stage: Stage, spot: Spot, tries: number): string | null {
  if (stage === "practicing" && spot.practiceLine) return spot.practiceLine;
  if (stage === "asking" && spot.preparedLine) return spot.preparedLine;
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
const TRANSLATIONS = { ...translationsData, ...focusTranslations } as unknown as Record<string, { english: string } & Record<string, Word>>;
function practiceFor(sp: Spot, language: string): Practice | null {
  const t = TRANSLATIONS[sp.id];
  const w = language && t ? (t[language] as Word | undefined) : undefined;
  return w && t ? { ...w, english: t.english, language, name: LEARN_LANGUAGES[language] ?? language } : null;
}
// The multilingual model reads the original script; romanization is display guidance only.
const GREETING: Record<string, string> = {
  es: "¡Hola! Let's learn Spanish!", fr: "Bonjour! Let's learn French!", de: "Hallo! Let's learn German!",
  zh: "你好! Let's learn Chinese!", hi: "नमस्ते! Let's learn Hindi!", ja: "こんにちは! Let's learn Japanese!",
};

// A "say X" spot whose word should be said in the learning language instead of the show's Spanish.
const swapsSayWord = (sp: Spot, practice: Practice | null): practice is Practice => !!(sp.say && practice && practice.language !== sp.say.language);
// A separate "now say it in French" step only makes sense when the pause itself wasn't already a say-it turn.
const canPractice = (sp: Spot, language: string) => !sp.say && !!practiceFor(sp, language);
const spoken = (p: Practice) => p.word;

// Dora's lines built from the spot's lesson, for spots without hand-written lines. No saved audio exists
// for these, so they're spoken live by the voice server.
function lessonText(stage: Stage, sp: Spot, practiced = false, practice: Practice | null = null): string | null {
  if (practice) {
    if (stage === "practicing") return practiced
      ? `Listen: ${practice.word}! Let's try ${practice.word} one more time!`
      : `In ${practice.name}, ${practice.english} is ${spoken(practice)}! Can you say ${practice.word}?`;
    if (practiced && stage === "celebrating") return `Yes! ${practice.word}! You said it in ${practice.name}!`;
    if (practiced && stage === "giving") return `${spoken(practice)}! That's ${practice.english} in ${practice.name}. Great try!`;
  }
  if (sp.custom || !sp.question) return null;
  // A "say it" spot asks for the word in the language being learned (the dubbed show just said it that way).
  const swap = swapsSayWord(sp, practice) ? practice : null;
  const q = swap ? `Can you say ${spoken(swap)}?` : sp.question;
  const target = swap?.word ?? sp.say?.word ?? sp.answer;
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

// Dora's Spanish show lines, re-voiced whole in the language being learned (tools/build-dubs.py), so the
// show itself matches the chosen language and stays one voice per sentence.
type Dub = { start: number; end: number; original: string; bed?: [number, number]; nextSpeechAt?: number } & Record<string, unknown>;
const DUBS = dubsData as unknown as Dub[];
const DUB_PREFETCH_S = 15; // fetch re-voiced lines this long before they're needed
const DUB_DUCK = 0.06; // fallback when a line has no bed: how far the show's own audio drops under the dub
const DUB_FADE_S = 0.25; // crossfade between the show and its no-voice bed
const DUB_LATE_S = 1; // a dub that isn't ready may still start this long after its line ends
const DUB_END_PAD_S = 0.4; // keep the voice removed this long past a line's transcript end

// Spots whose own scene has a calm waiting moment get an in-scene talk/wait loop (tools/cut-loops.py).
// Every other spot holds the paused frame. Dora never jumps to a different scene.
const LOOPS = loopsData as Record<string, { talk: boolean }>;

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
    case "practicing": return "praise the attempt, model the target word again, and ask the child to try it once more";
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

// The interactive Dora player. `/lab` shows it with every debug control; the kid view (`/`) shows only the
// screen, with the mic always on and the same controls in a hidden dev drawer (press ` or add ?dev).
export function DoraPlayer({ kid = false, learn: learnProp, onLearnChange, controlsTarget, captionsEnabled = true, learningFocus, requestedLesson, onLanguageState }: {
  kid?: boolean;
  learn?: string; // language to practise, driven by the kid view's language row
  onLearnChange?: (code: string) => void; // the dev drawer's picker changed it
  controlsTarget?: HTMLElement | null;
  captionsEnabled?: boolean;
  learningFocus?: Record<string, string>;
  requestedLesson?: RequestedLesson;
  onLanguageState?: (state: { code: string; status: "queued" | "active" }) => void;
}) {
  const [ctx, setCtx] = useState<Ctx>(INITIAL);
  const [started, setStarted] = useState(false);
  const previousFocus = useRef(learningFocus?.numbers);
  const queuedAddition = useRef(false);
  const pendingLanguageLesson = useRef<RequestedLesson | null>(null);
  const lastLessonRequest = useRef(0);
  const pendingLanguage = useRef<string | undefined>(undefined);
  const [languageTick, setLanguageTick] = useState(0);
  const additionIndex = useRef(0);
  const priorStage = useRef<Stage>("watching");
  const [spot, setSpot] = useState<Spot>(FIREHOUSE);
  const [autoPause, setAutoPause] = useState(true);
  const [likelyOnly, setLikelyOnly] = useState(false);
  const [localVoice, setLocalVoice] = useState(false); // saved lines start instantly; Luna's own lines are still generated live
  const [voiceText, setVoiceText] = useState("A bigger number on the bottom means smaller pieces. Shall we try again?");
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
  const labVerdict = useRef<Event | null>("CORRECT"); // lab buttons: the verdict "thinking" sends after THINK_MS; null = a real judge is deciding
  const [kidText, setKidText] = useState("");
  const [judgeInfo, setJudgeInfo] = useState("");
  const [pron, setPron] = useState<Pronunciation | null>(null);
  const pronRef = useRef<Pronunciation | null>(null);
  pronRef.current = pron;
  const playId = useRef(crypto.randomUUID()); // this viewing: the session trace's ID
  const labSession = useRef(`lab-${playId.current}`); // live-event channel for this viewing
  const trace = useRef<ReturnType<typeof createTrace> | null>(null); // kid view only: the lab never records
  const turnId = useRef<string | null>(null); // the pause in progress, from "entering" back to "watching"
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [handsFree, setHandsFree] = useState(kid); // kid view: the mic is always on
  const [devOpen, setDevOpen] = useState(false);
  const [learn, setLearn] = useState(""); // language the kid is learning ("" = off)
  const [flash, setFlash] = useState<string | null>(null); // a quick caption, e.g. Dora's greeting in the new language
  const greetAbort = useRef<AbortController | null>(null);
  // Dub audio, kept for the session: the re-voiced lines (per language) and the show's no-voice beds.
  const dubCache = useRef(new Map<string, AudioBuffer | "pending">());
  const bedCache = useRef(new Map<number, AudioBuffer | "pending">());
  const sound = useRef<SoundOwner>("show"); // who controls the show's volume (app/lab/sound.ts)

  // Each audio cache entry: missing → "pending" → decoded. A failed load leaves it missing, so a later
  // prefetch pass tries again.
  async function loadOnce<K>(cache: Map<K, AudioBuffer | "pending">, key: K, load: () => Promise<AudioBuffer>, tries = 1, waitMs = 0) {
    if (cache.has(key)) return;
    cache.set(key, "pending");
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        return void cache.set(key, await load());
      } catch {
        if (attempt < tries - 1) await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    cache.delete(key);
  }

  function dubVoice(d: Dub, lang: string) {
    const text = d[lang];
    if (typeof text !== "string") return;
    // The voice server takes one line at a time (429 while busy): wait our turn.
    return loadOnce(dubCache.current, `${d.start}:${lang}`, () => fetchVoice({ text, language: lang,
      durationSeconds: Math.max(0.1, Math.min(d.end - d.start + 0.3, (d.nextSpeechAt ?? d.end + 1) - d.start - DUB_FADE_S)),
      context: audio.current!.ctx, signal: new AbortController().signal }), 12, 600);
  }

  function dubBed(d: Dub) {
    if (!d.bed) return;
    const key = d.bed[0]; // lines in one run share a bed, keyed by its start
    return loadOnce(bedCache.current, key, async () =>
      audio.current!.ctx.decodeAudioData(await (await fetch(`/media/dubs/bed-${key.toFixed(2)}.m4a`)).arrayBuffer()));
  }

  const learnRef = useRef(learn);
  learnRef.current = learn;
  const [hearing, setHearing] = useState(false);
  const [mic, setMic] = useState<MediaStream | null>(null); // one stream for the whole hands-free session
  const [listenKey, setListenKey] = useState(0); // bump to re-arm the mic after a failed turn
  const [loopInfo, setLoopInfo] = useState("");
  const [heardInfo, setHeardInfo] = useState("");
  // Turn-gap timing from the kid's last sound: when Dora's first sound (the "Hmm!") and her answer started.
  const gap = useRef<{ from: number; first: number | null } | null>(null);
  const turn = useRef(0); // bumped on every new turn, jump or forced stage: late replies from older turns are dropped
  const episode = useRef<HTMLVideoElement>(null);
  const line = useRef<HTMLAudioElement>(null);
  const filler = useRef<HTMLAudioElement>(null); // its own element: stage changes pause `line`, which would cut the "Hmm!" off
  const loops = useRef<Record<Loop, HTMLVideoElement | null>>({ talk: null, wait: null });
  const audio = useRef<{ ctx: AudioContext; epGain: GainNode; analyser: AnalyserNode } | null>(null);
  const stage = ctx.stage;
  const meta = STAGES[stage];
  autoRef.current = autoPause;

  // Session trace (Postgres via /api/play/events): every stage, what was heard, how it was judged.
  function rec(fields: Parameters<ReturnType<typeof createTrace>["record"]>[0]) {
    trace.current?.record({ turnId: turnId.current ?? undefined, spotId: spotRef.current.id, ...fields });
  }

  useEffect(() => {
    if (!kid) return;
    const t = createTrace(playId.current, trialEpisode.id, () => ({ type: "session_end", watchedSeconds: episode.current?.currentTime ?? 0 }));
    trace.current = t;
    t.record({ type: "session_start", episodeId: trialEpisode.id, language: learnRef.current });
    return () => {
      t.stop();
      trace.current = null;
    };
  }, [kid]);

  // Tell the parent's live view what's happening (Convex, via /api/lab/turn). Never what the child said.
  function publishTurn(n: Ctx) {
    // "giving" has no outcome: Dora showing the answer can follow a wrong answer or just silence.
    const outcome = ({ celebrating: "correct", teaching: "wrong", clarifying: "unclear", nudging: "silent" } as const)[n.stage as string];
    if (!outcome && !["asking", "giving", "practicing", "watching"].includes(n.stage)) return;
    const sp = spotRef.current;
    const practising = n.stage === "practicing" || (n.practiced && (n.stage === "celebrating" || n.stage === "giving"));
    const practice = practising ? practiceFor(sp, learnRef.current) : null;
    void fetch("/api/lab/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: labSession.current, spotId: sp.id, stage: n.stage, question: askedText(sp).slice(0, 200),
        outcome, verdict: outcome && pronRef.current ? pronRef.current.verdict : undefined, skill: sp.skill,
        language: practice?.language, practiceWord: practice?.word,
      }),
    }).catch(() => undefined); // live view is best-effort; the show never waits on it
  }

  function commit(n: Ctx, label: string) {
    const changed = n.stage !== ctxRef.current.stage;
    ctxRef.current = n;
    setCtx(n);
    if (changed) {
      publishTurn(n);
      if (n.stage === "entering") turnId.current = crypto.randomUUID();
      const sp = spotRef.current;
      rec({
        type: "stage", stage: n.stage, tries: n.tries, nudges: n.nudges, modeled: n.modeled, practiced: n.practiced,
        question: askedText(sp).slice(0, 300), skill: sp.skill,
        word: n.stage === "practicing" ? practiceFor(sp, learnRef.current)?.word : undefined,
      });
      if (n.stage === "watching") turnId.current = null;
    }
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
    labVerdict.current = null;
    send("SPEECH_END");
    playFiller();
    if (sayTarget()) void scoreClip(clip);
    else void transcribeAndJudge(clip);
  }

  // What the kid should say right now, if it's a "say" turn: the practice word, or the spot's say word.
  function sayTarget(): { word: string; language: string; ipa: string } | undefined {
    const sp = spotRef.current;
    const p = practiceFor(sp, learnRef.current);
    return p && (ctxRef.current.practiced || swapsSayWord(sp, p)) ? { word: p.word, language: p.language, ipa: p.ipa } : sp.say;
  }

  // A listening step failed: go back to listening (the mic re-arms).
  function backToListening(why: string) {
    setJudgeInfo(why);
    if (ctxRef.current.stage === "thinking") commit({ ...ctxRef.current, stage: "listening" }, "retry listening");
    else setListenKey((k) => k + 1);
  }

  const answering = () => ["listening", "thinking"].includes(ctxRef.current.stage);
  // Each judging request (transcribe, pronounce, Luna) takes a ticket. Its reply counts only while its ticket
  // is the newest and Dora is still waiting for an answer; jumps and forced stages take a ticket too.
  const ticket = () => ++turn.current;
  const stillMine = (t: number) => t === turn.current && answering();

  // Switching language takes effect at once: the very next answer is practised in it, and if the show is
  // playing Dora greets in that language right away (the show dips while she talks).
  function applyLearn(code: string, greetNow = true) {
    if (code === learnRef.current) {
      if (pendingLanguage.current !== undefined) {
        pendingLanguage.current = undefined;
        onLanguageState?.({ code, status: "active" });
      }
      return;
    }
    if (started && (ctxRef.current.stage !== "watching" || sound.current === "greeting")) {
      if (pendingLanguage.current !== code) {
        pendingLanguage.current = code;
        if (onLanguageState) onLanguageState({ code, status: "queued" });
        else showFlash(`${LEARN_LANGUAGES[code] ?? "English"} is next. Let's finish this question!`);
      }
      return;
    }
    pendingLanguage.current = undefined;
    setLearn(code);
    learnRef.current = code;
    rec({ type: "language", language: code });
    const n = { ...ctxRef.current, practice: canPractice(spotRef.current, code) };
    ctxRef.current = n;
    setCtx(n);
    onLearnChange?.(code);
    onLanguageState?.({ code, status: "active" });
    const text = code ? GREETING[code] ?? `Let's learn ${LEARN_LANGUAGES[code]}!` : "Okay, just English for now!";
    if (greetNow && audio.current && canTake(sound.current, "greeting")) void greet(text);
    else if (!onLanguageState) showFlash(text);
  }

  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function showFlash(text: string | null, ms = 2500) {
    clearTimeout(flashTimer.current);
    setFlash(text);
    if (text) flashTimer.current = setTimeout(() => setFlash(null), ms);
  }

  async function greet(text: string) {
    greetAbort.current?.abort();
    const ac = new AbortController();
    greetAbort.current = ac;
    const a = audio.current!;
    takeSound("greeting", 0.2); // the show dips while she talks; mid-dub it just stays dubbed
    showFlash(text, 8000);
    try {
      await streamVoice({ text, learningLanguage: learnRef.current || undefined,
        context: a.ctx, destination: a.analyser, signal: ac.signal,
        onSpeaking: (on) => { liveSpeaking.current = on; }, onMetrics: () => undefined });
    } catch {
      if (!ac.signal.aborted) await captionFallback(text, ac.signal);
    }
    if (ac.signal.aborted) return;
    showFlash(null);
    releaseSound("greeting");
    setLanguageTick(tick => tick + 1);
  }

  // Kid view: the language row drives this player.
  useEffect(() => {
    const code = learnProp ?? pendingLanguage.current;
    if (code !== undefined) applyLearn(code, requestedLesson?.language !== code);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the prop only
  }, [learnProp, stage, languageTick]);

  // Hands-free: the kid's spoken answer → local Whisper → Luna.
  async function transcribeAndJudge(clip: Blob) {
    const sp = spotRef.current;
    const form = new FormData();
    form.append("audio", clip);
    // The question only, never the answer: priming Whisper with "seatbelt" would make it hear seatbelt.
    form.append("hint", askedText(sp).slice(-200));
    for (const l of new Set(["en", "es", sp.say?.language ?? "en", learnRef.current || "en"])) form.append("languages", l);
    const mine = ticket();
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const out = await res.json();
      if (!stillMine(mine)) return;
      if (!res.ok) throw new Error(out.error ?? "Transcription failed.");
      setHeardInfo(`Heard “${out.text}” (${out.language ?? "silence"}) · transcribed in ${out.ms} ms`);
      rec({ type: "heard", text: String(out.text ?? "").slice(0, 500), ms: typeof out.ms === "number" ? Math.round(out.ms) : undefined });
      if (clearlyCorrect(out.text, sp.accept ?? (sp.answer ? [sp.answer] : []), sp.preparedLine ? "recall" : strictnessOf(sp))) {
        setJudgeInfo("Instant: clear answer, no Luna call");
        rec({ type: "judged", verdict: "correct", source: "instant" });
        send("SPEECH_END");
        return send("CORRECT");
      }
      void askLuna(out.text);
    } catch (error) {
      if (!stillMine(mine)) return;
      backToListening(error instanceof Error ? error.message : "Transcription failed.");
    }
  }

  // Kid's words → Luna picks the event and Dora's line in one tool call → machine switches.
  async function askLuna(said: string, pronunciation?: Pronunciation) {
    const sp = spotRef.current;
    const c = { ...ctxRef.current, stage: "thinking" as const };
    const ev = { correct: "CORRECT", wrong: "WRONG", unclear: "UNCLEAR" } as const;
    const mine = ticket();
    labVerdict.current = null;
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
          strictness: strictnessOf(sp),
          // Only the sound to model goes to Luna, so the line can't dwell on what the kid got wrong.
          pronunciation: pronunciation && { verdict: pronunciation.verdict, expected: pronunciation.coach?.expected ?? null },
          language: learnRef.current ? { code: learnRef.current, name: LEARN_LANGUAGES[learnRef.current] ?? learnRef.current } : undefined,
          outcomes: { correct: outcome(next(c, "CORRECT")), wrong: outcome(next(c, "WRONG")), unclear: outcome(next(c, "UNCLEAR")) },
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? "Judge failed.");
      if (!stillMine(mine) || ctxRef.current.stage !== "thinking") return; // kid left, or a newer turn started
      setJudgeInfo(`Luna: ${out.event} · ${out.skill} · ${out.ms} ms model / ${Math.round(performance.now() - started)} ms total`);
      rec({ type: "judged", verdict: out.event, say: String(out.say).slice(0, 400), source: "luna", ms: Math.round(performance.now() - started) });
      liveText.current = out.say;
      setSpeechCaption(out.say); // so the saved generic line never flashes first
      send(ev[out.event as keyof typeof ev]);
    } catch (error) {
      if (!stillMine(mine)) return;
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
    const mine = ticket();
    try {
      const res = await fetch("/api/pronounce", { method: "POST", body: form });
      const out = await res.json();
      if (!stillMine(mine)) return setJudgeInfo("Clip ignored: a newer turn started."); // stale
      if (!res.ok) throw new Error(out.error ?? "Scoring failed.");
      setPron(out);
      rec({ type: "pronounced", verdict: out.verdict, ms: typeof out.ms === "number" ? Math.round(out.ms) : undefined });
      // Good or silent needs no tailored line: answer instantly. Close or retry gets Luna's coaching.
      if (out.verdict === "good" || out.verdict === "silent") {
        setJudgeInfo(`Instant: pronunciation ${out.verdict}, no Luna call`);
        send("SPEECH_END");
        return send(out.verdict === "good" ? "CORRECT" : "UNCLEAR");
      }
      void askLuna(`(sounded like: ${out.heard})`, out);
    } catch (error) {
      if (!stillMine(mine)) return;
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
    ticket(); // drops any reply still on its way
    commit({ ...ctxRef.current, stage: st }, "forced");
  }

  function pickSpot(sp: Spot) {
    spotRef.current = sp;
    setSpot(sp);
    ctxRef.current = { ...ctxRef.current, practiceOnly: !!sp.practiceOnly, known: isKnown(sp), practice: canPractice(sp, learnRef.current) };
  }

  function jump(sp: Spot) {
    if (!started) return;
    ticket(); // drops any reply still on its way
    setPron(null);
    setJudgeInfo("");
    setHeardInfo("");
    setLoopInfo("");
    pickSpot(sp);
    lastResumed.current = null;
    episode.current!.currentTime = Math.max(0, sp.t - 2);
    commit({ ...INITIAL, practiceOnly: !!sp.practiceOnly, known: isKnown(sp), practice: canPractice(sp, learnRef.current) }, `jump ${sp.id}`);
    episode.current!.play();
  }

  function fadeEpisode(to: number, seconds = FADE_MS / 1000) {
    const a = audio.current;
    if (!a) return;
    const g = a.epGain.gain;
    g.cancelScheduledValues(a.ctx.currentTime);
    g.setValueAtTime(g.value, a.ctx.currentTime);
    g.linearRampToValueAtTime(to, a.ctx.currentTime + seconds);
  }

  // The only two places the show's volume changes hands (app/lab/sound.ts has the rules).
  function takeSound(who: SoundOwner, volume: number, seconds?: number): boolean {
    if (!canTake(sound.current, who)) return false;
    if (silencesGreeting(who)) greetAbort.current?.abort();
    sound.current = who;
    fadeEpisode(volume, seconds);
    return true;
  }
  function releaseSound(who: SoundOwner, seconds?: number) {
    const now = afterRelease(sound.current, who);
    if (now === sound.current) return; // someone else has it
    sound.current = now;
    fadeEpisode(1, seconds);
  }

  function start() {
    if (audio.current) return; // media elements can only be wired into Web Audio once (dev mounts effects twice)
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

  // Lab: jump to the firehouse once audio is wired up. Kid view: watch from the top and pause at each spot.
  useEffect(() => {
    if (!started) return;
    if (!kid) return jump(FIREHOUSE);
    lastResumed.current = null;
    episode.current!.currentTime = 0;
    commit({ ...INITIAL }, "start");
    void episode.current!.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on start
  }, [started]);

  useEffect(() => {
    if (requestedLesson && requestedLesson.requestedAt > lastLessonRequest.current) {
      pendingLanguageLesson.current = requestedLesson;
      lastLessonRequest.current = requestedLesson.requestedAt;
    }
    const request = pendingLanguageLesson.current;
    if (!request || !started || stage !== "watching" || request.language !== learnRef.current) return;
    const word = TRANSLATIONS[request.id]?.[request.language];
    const translation = TRANSLATIONS[request.id];
    pendingLanguageLesson.current = null;
    if (!word || !translation) return;
    const at = episode.current!.currentTime;
    ticket();
    pickSpot({ id: request.id, text: `Say ${word.word}`, question: `Can you say ${word.word}?`, answer: word.word,
      practiceOnly: true, practiceLine: request.id === "demo-addition-1" ? ({ hi: "practiceHindiThree", es: "practiceSpanishThree" } as Record<string,string>)[request.language] : undefined,
      skill: "words", visual: false, t: at, pauseAt: at, resumeAt: at, gap: 0, talk: [at, at], wait: [at, at] });
    send("PAUSE_POINT");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queued requests wait for the active exchange to finish
  }, [requestedLesson, stage, started, learnProp, languageTick]);

  useEffect(() => {
    if (wantsAddition(previousFocus.current, learningFocus?.numbers)) queuedAddition.current = true;
    previousFocus.current = learningFocus?.numbers;
    const finishedMath = priorStage.current === "exiting" && stage === "watching"
      && ["count-to-5", "count-to-10", "how-many"].includes(skillOf(spotRef.current.id) ?? "");
    priorStage.current = stage;
    if (finishedMath && learningFocus?.numbers === "more") queuedAddition.current = true;
    if (!started || stage !== "watching" || !queuedAddition.current || learningFocus?.numbers !== "more") return;
    queuedAddition.current = false;
    const lesson = additionLesson(additionIndex.current++);
    const at = episode.current!.currentTime;
    ticket();
    pickSpot({ ...lesson, accept: [...lesson.accept], preparedLine: lesson.line, skill: "counting", visual: false,
      text: lesson.question, t: at, pauseAt: at, resumeAt: at, gap: 0, talk: [at, at], wait: [at, at] });
    send("PAUSE_POINT");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs own the active turn; only plan/stage changes schedule a new lesson
  }, [learningFocus, stage, started]);

  // Kid view: start right away (the parent's "Let's watch" tap already allowed sound and the mic),
  // and a hidden dev drawer with the stage machine: press ` or open with ?dev.
  useEffect(() => {
    if (!kid) return;
    start();
    setDevOpen(new URLSearchParams(location.search).has("dev"));
    const onKey = (e: KeyboardEvent) => { if (e.key === "`") setDevOpen((o) => !o); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

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
      releaseSound("pause");
      releaseSound("dub"); // a fresh watching effect has no dub running yet: a "dub" owner here is left over
      ep.play();
      // Freeze at whichever spot the playhead crosses.
      // Dubbing: the show crossfades to its own audio with the voice removed (the "bed"), and the re-voiced
      // line plays on top, so music and effects never drop. Lines and beds are fetched well ahead and cached.
      const a = audio.current!;
      // A run of close Dora lines shares one bed, so the original voice never comes back between them.
      type Run = { language: string; lines: Dub[]; bed: [number, number] | undefined; src: AudioBufferSourceNode | null; gain: GainNode | null; voices: Set<AudioBufferSourceNode>; voiceGain: GainNode; played: Set<Dub>; voiceEnds: number };
      let active: Run | null = null;
      const ended = new Set<string>(); // "fr:46.7": lines whose run is over, so an early handback can't replay them (seeking back before a line re-dubs it)
      const fade = (param: AudioParam, to: number, seconds = DUB_FADE_S) => {
        param.cancelScheduledValues(a.ctx.currentTime);
        param.setValueAtTime(param.value, a.ctx.currentTime);
        param.linearRampToValueAtTime(to, a.ctx.currentTime + seconds);
      };
      const endDub = (restore: boolean) => {
        if (!active) return;
        const { src, gain, voices, voiceGain } = active;
        for (const d of active.lines) ended.add(`${active.language}:${d.start}`);
        active = null;
        if (gain) fade(gain.gain, 0);
        fade(voiceGain.gain, 0);
        setTimeout(() => {
          for (const source of voices) { try { source.stop(); } catch { /* already stopped */ } source.disconnect(); }
          if (src) { try { src.stop(); } catch { /* already stopped */ } src.disconnect(); }
          gain?.disconnect();
          voiceGain.disconnect();
        }, DUB_FADE_S * 1000 + 50);
        if (restore) releaseSound("dub", DUB_FADE_S); // otherwise the pause taking over sets the volume
      };
      speechAbort.signal.addEventListener("abort", () => endDub(false), { once: true }); // a pause takes over the audio
      // A run ends when the language changes or turns off, its last line is done (handed back just before the
      // next speaker), or its voice-free track runs out. A pause ends it too, through speechAbort.
      const finished = (run: Run, t: number, lang: string) => {
        if (run.language !== lang) return true;
        const last = run.lines[run.lines.length - 1]!;
        // Whisper's line ends run a little early: keep the bed a moment longer so no original syllable leaks.
        const handback = last.nextSpeechAt === undefined ? Infinity : last.nextSpeechAt - DUB_FADE_S;
        return t >= Math.min(handback, Math.max(last.end + DUB_END_PAD_S, run.voiceEnds + 0.1))
          || (run.bed !== undefined && t >= run.bed[1] - DUB_FADE_S - 0.05);
      };
      const runOf = (d: Dub, lang: string) => DUBS.filter((x) => typeof x[lang] === "string" && (d.bed ? x.bed?.[0] === d.bed[0] : x === d));
      const dubTick = () => {
        const lang = learnRef.current;
        const t = ep.currentTime;
        if (active && finished(active, t, lang)) endDub(true);
        if (!lang || lang === "es") return; // Spanish is what the show already speaks
        // Fetch the next couple of lines (and their beds) ahead of time; retried while the voice server is busy.
        for (const d of DUBS.filter((x) => typeof x[lang] === "string" && x.start > t && x.start - t < DUB_PREFETCH_S).slice(0, 3)) {
          void dubVoice(d, lang);
          void dubBed(d);
        }
        if (!active) {
          const d = DUBS.find((x) => typeof x[lang] === "string" && !(ended.has(`${lang}:${x.start}`) && t >= x.start - 0.05) && t >= (x.bed?.[0] ?? x.start - 0.05) && t < x.end);
          if (!d) return;
          const voiceGain = a.ctx.createGain();
          voiceGain.connect(a.analyser);
          active = { language: lang, lines: runOf(d, lang), bed: d.bed, src: null, gain: null,
            voices: new Set(), voiceGain, played: new Set(), voiceEnds: 0 };
          const bedBuffer = d.bed ? bedCache.current.get(d.bed[0]) : undefined;
          if (d.bed && bedBuffer instanceof AudioBuffer) {
            // The same moment of the show, minus the voice: started at the matching offset so it stays in sync.
            const src = a.ctx.createBufferSource();
            const gain = a.ctx.createGain();
            gain.gain.value = 0;
            src.buffer = bedBuffer;
            src.connect(gain).connect(a.ctx.destination);
            src.start(0, Math.max(0, t - d.bed[0]));
            fade(gain.gain, 1);
            takeSound("dub", 0, DUB_FADE_S);
            active.src = src;
            active.gain = gain;
          } else takeSound("dub", DUB_DUCK, DUB_FADE_S); // no bed for this run: fall back to turning the show down
        }
        const run = active;
        // Each line plays on cue, or a little late if its audio arrives late (never handed back to the Spanish).
        for (const d of run.lines) {
          const buffer = dubCache.current.get(`${d.start}:${lang}`);
          if (run.played.has(d) || t < d.start - 0.05 || t > d.end + DUB_LATE_S || !(buffer instanceof AudioBuffer)) continue;
          run.played.add(d);
          const src = a.ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(run.voiceGain);
          run.voices.add(src);
          src.onended = () => { run.voices.delete(src); src.disconnect(); };
          src.start();
          speechAbort.signal.addEventListener("abort", () => { try { src.stop(); } catch { /* already ended */ } }, { once: true });
          run.voiceEnds = Math.max(run.voiceEnds, t + buffer.duration);
        }
      };
      // A pause point counts when the playhead is just past it, or crossed it since the last frame during normal
      // playback. Frames can be a second apart (background tab), so a narrow window alone misses questions;
      // a big jump ahead is a seek and skips them. "entering" rewinds to the exact pause frame.
      let prev = ep.currentTime;
      const watch = () => {
        dubTick();
        const t = ep.currentTime;
        const reached = (x: Spot) => t >= x.pauseAt && (t < x.pauseAt + 0.5 || (prev < x.pauseAt && t - prev < 3));
        prev = t;
        const hit = autoRef.current
          ? SPOTS.find((x) => x.keep !== false && x.id !== lastResumed.current && reached(x))
          : undefined;
        if (hit) {
          pickSpot(hit);
          send("PAUSE_POINT");
        } else raf = requestAnimationFrame(watch);
      };
      watch();
    } else {
      ep.pause();
      takeSound("pause", 0);
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
      // Held frame: carry on from exactly the frame on screen, so unpausing is invisible. In-scene loop: the loop
      // has moved past the pause, so come back just before the next line (its first word isn't clipped).
      ep.currentTime = LOOPS[sp.id] ? Math.max(sp.pauseAt, sp.resumeAt - RESUME_LEAD_S) : sp.pauseAt;
      timers.push(setTimeout(() => ep.removeEventListener("seeked", done), 5000));
    }
    if (stage === "thinking" && labVerdict.current) {
      const e = labVerdict.current;
      timers.push(setTimeout(() => send(e), THINK_MS));
    }
    if (meta.line) {
      filler.current!.pause(); // never talk over her own "Hmm!"
      const file = lineFor(stage, sp, ctxRef.current.tries);
      const fromLesson = lessonText(stage, sp, ctxRef.current.practiced, practiceFor(sp, learnRef.current));
      if (file || fromLesson) {
        const customText = liveText.current;
        liveText.current = null;
        const saved = file ? LINES[file] : undefined;
        const flaired = saved && localFlair(saved, learnRef.current);
        const text = customText ?? fromLesson ?? flaired;
        setSpeechCaption(text ?? null);
        setVoiceError("");
        // Live when the text differs from the saved recording (custom, lesson, or a swapped catchphrase).
        if ((voiceMode.current || customText !== null || text !== saved) && text) {
          const a = audio.current!;
          void streamVoice({
            text, learningLanguage: learnRef.current || undefined,
            context: a.ctx, destination: a.analyser, signal: speechAbort.signal,
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
            setVoiceError(`${error instanceof Error ? error.message : "Speech failed."} Showing captions while Dora's voice is unavailable.`);
            await captionFallback(text, speechAbort.signal);
            if (!speechAbort.signal.aborted) send("LINE_DONE");
          });
        } else {
          ln.src = `/media/lab/${file}.m4a`;
          ln.onplaying = doraStartedSpeaking;
          ln.onended = () => send("LINE_DONE");
          ln.onerror = () => {
            setVoiceError("Saved voice line could not be loaded. Showing captions.");
            void captionFallback(text ?? "", speechAbort.signal)
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
      const speaking = !line.current!.paused || !filler.current!.paused || liveSpeaking.current;
      // The browser voice can't be measured, so the mouth just talks while it speaks.
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
  const practiceNow = practiceFor(spot, learn);
  const sayNow = practiceNow && (ctx.practiced || swapsSayWord(spot, practiceNow)) ? practiceNow : spot.say; // what the record button scores
  const lineText = lessonText(stage, spot, ctx.practiced, practiceFor(spot, learn)) ?? (file && LINES[file] ? localFlair(LINES[file], learn) : null);
  const caption = lineText ? (speechCaption ?? lineText)
    : flash ? flash
    : stage === "listening" ? (hearing ? "🗣️ I'm listening…" : `🎤 ${askedText(spot)}`)
    : stage === "thinking" ? "…" : "";
  const inScene = LOOPS[spot.id]; // this spot's own in-scene loops, if its scene has a calm wait
  const shown = likelyOnly ? SPOTS.filter((x) => x.gap >= LIKELY_GAP) : SPOTS;

  const screen = (
        <div className={s.screen}>
          <video ref={episode} crossOrigin="anonymous" src={EPISODE} playsInline preload="auto"
            className={`${s.layer} ${meta.assistant && stage !== "exiting" && !inScene ? s.hold : s.release}`} />
          <div className={`${s.layer} ${s.assistant} ${meta.assistant && inScene ? s.show : ""}`}>
            {(["wait", "talk"] as Loop[]).map((n) => (
              <video
                key={n}
                ref={(el) => {
                  loops.current[n] = el;
                }}
                src={inScene ? `/media/loops/${spot.id}-${n === "talk" && !inScene.talk ? "wait" : n}.mp4` : undefined}
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
          {captionsEnabled && caption && <p className={s.caption}>{caption}</p>}
          {!started && !controlsTarget && (
            <button className={s.start} onClick={start}>
              ▶ Start
            </button>
          )}
        </div>
  );

  const controls = (
    <>
        <div className={s.kid}>
          <span>The kid…</span>
          {KID.map((k) => (
            <button
              key={k.label}
              disabled={stage !== "listening"}
              onClick={() => {
                if (k.result === "SILENCE") return send("SILENCE");
                labVerdict.current = k.result;
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
            <select value={learn} onChange={(e) => applyLearn(e.target.value)}>
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
    </>
  );

  const panel = (
    <>
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
    </>
  );

  const audioEls = (
    <>
      <audio ref={line} preload="auto" />
      <audio ref={filler} src="/media/lab/hmm.m4a" preload="auto" />
    </>
  );

  if (kid) {
    return (
      <div className={s.kidRoot} data-session-id={playId.current}>
        {screen}
        {controlsTarget ? createPortal(
          <div className={s.dockedControls}>
            {!started && <button className={s.dockedStart} onClick={start}>▶ Start episode</button>}
            <button onClick={() => setDevOpen((o) => !o)} aria-expanded={devOpen} aria-label={devOpen ? "Hide dev tools" : "Show dev tools"}>⚙︎ Tools</button>
          </div>,
          controlsTarget,
        ) : createPortal(
          <button className={s.devToggle} onClick={() => setDevOpen((o) => !o)} aria-label={devOpen ? "Hide dev tools" : "Show dev tools"} title="Dev tools (`)">
            ⚙︎
          </button>,
          document.body,
        )}
        {devOpen && createPortal(
          <aside className={s.devDrawer} aria-label="Dev tools">
            <div className={s.devHeading}>
              <p className={s.meta}>Dev tools · press ` to hide</p>
              <button onClick={() => setDevOpen(false)} aria-label="Close dev tools">Close ×</button>
            </div>
            {controls}
            <div className={s.panel}>{panel}</div>
          </aside>,
          document.body,
        )}
        {audioEls}
      </div>
    );
  }

  return (
    <main className={s.lab}>
      <section className={s.stageWrap}>
        {screen}
        {controls}
      </section>
      <aside className={s.panel}>{panel}</aside>
      {audioEls}
    </main>
  );
}
