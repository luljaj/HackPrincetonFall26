// `npm run db:seed-play -w web [-- --reset]`: fills DATABASE_URL with a believable two weeks of Play-mode viewings
// for the demo child, so the parent view (sessions, Mastery, language words, chat answers) has real-looking
// history. Every viewing goes through the real play store (the same ingest path the TV uses), so turns,
// outcomes and mastery levels are computed exactly as they would be live. Deterministic (fixed seed).
// --reset clears existing Play data first; without it the script refuses to add to existing viewings.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import spotsData from "../../app/lab/spots.json" with { type: "json" };
import lessonsData from "../../app/lab/lessons.json" with { type: "json" };
import translationsData from "../../app/lab/translations.json" with { type: "json" };
import demoEdit from "../../app/lab/demo-edit.json" with { type: "json" };
import episode from "../../app/lab/episode.json" with { type: "json" };
import { skillOf } from "../../lib/play/mastery";
import type { PlayEvent } from "../../lib/play/trace";
import { createPostgresPlayStore } from "./play";
import type { StoreDb } from "./postgres";
import * as schema from "./schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fall back to the shell environment.
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (apps/web/.env.local).");
  process.exit(1);
}

type Lesson = { question: string; answer: string; accept: string[]; type: string; say_word: string | null; asked?: boolean; keep?: boolean; skill?: string };
type Word = { word: string };
const LESSONS = lessonsData as Record<string, Lesson>;
const WORDS = translationsData as unknown as Record<string, { english: string } & Record<string, Word>>;
const SPOTS = (spotsData as Array<{ id: string; pauseAt: number }>).filter((s) => LESSONS[s.id] && LESSONS[s.id]!.keep !== false);
const DEMO = new Set(demoEdit.exercises.map((x) => x.pauseId));
// The moments a kid meets: the regular curated pauses plus the demo's, in episode order.
const POOL = SPOTS.filter((s) => LESSONS[s.id]!.asked || DEMO.has(s.id)).sort((a, b) => a.pauseAt - b.pauseAt);

// Deterministic randomness, so a reseed gives the same history.
let seed = 20261115;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const between = (a: number, b: number) => a + rand() * (b - a);
const uuid = () => crypto.randomUUID();

const RECALL = new Set(["recall-places", "recall-objects", "recall-events"]);
const WRONG_BY_SKILL: Record<string, string[]> = {
  "recall-places": ["the pyramid?", "um... the house", "the park"],
  "recall-objects": ["a dog?", "the backpack", "Boots!"],
  "recall-events": ["Swiper?", "the monkey", "I don't know"],
  "pick-place": ["over there?", "the tree", "um... that one"],
  "pick-object": ["the rock?", "no, that one", "the bird"],
  "match-shapes": ["a circle!", "the square", "a star?"],
  "name-shapes": ["a circle", "the square"],
  "count-to-5": ["three!", "five?"],
  "count-to-10": ["five!", "seven?"],
  "how-many": ["four?", "three!"],
};
const HINTS = [
  "Good try! Let's look again. What do you see?",
  "Ooh, close! Think about what Dora said a moment ago.",
  "Nice thinking! Look at the picture one more time.",
];

// One viewing: when it started (local time, days ago), which stretch of the episode, which language.
const VIEWINGS: Array<{ daysAgo: number; at: string; from: number; count: number; language: string }> = [
  { daysAgo: 12, at: "16:20", from: 0, count: 4, language: "es" },
  { daysAgo: 11, at: "17:45", from: 2, count: 5, language: "es" },
  { daysAgo: 9, at: "09:30", from: 0, count: 6, language: "es" },
  { daysAgo: 8, at: "16:05", from: 5, count: 5, language: "es" },
  { daysAgo: 7, at: "18:10", from: 3, count: 6, language: "es" },
  { daysAgo: 6, at: "16:40", from: 8, count: 5, language: "es" },
  { daysAgo: 5, at: "17:15", from: 0, count: 7, language: "es" },
  { daysAgo: 4, at: "10:05", from: 6, count: 6, language: "es" },
  { daysAgo: 3, at: "16:30", from: 1, count: 6, language: "es" },
  { daysAgo: 2, at: "17:50", from: 9, count: 6, language: "es" },
  { daysAgo: 1, at: "16:15", from: 0, count: 6, language: "hi" },
];

const practicedGood = new Map<string, number>(); // word → times said well so far (practice gets easier)

function viewing(v: (typeof VIEWINGS)[number], progress: number): { sessionId: string; events: PlayEvent[] } {
  const [h, m] = v.at.split(":").map(Number) as [number, number];
  const day = new Date();
  day.setDate(day.getDate() - v.daysAgo);
  day.setHours(h, m, Math.floor(between(0, 59)), 0);
  const spots = POOL.slice(v.from, v.from + v.count);
  const startPos = Math.max(0, spots[0]!.pauseAt - between(60, 140)); // starts watching a minute or two before
  let clock = day.getTime();
  const sessionId = uuid();
  const events: PlayEvent[] = [];
  const add = (fields: Omit<PlayEvent, "seq" | "at">, afterMs = 0) => {
    clock += Math.round(afterMs);
    events.push({ ...fields, seq: events.length, at: clock } as PlayEvent);
  };
  add({ type: "session_start", episodeId: episode.id, language: v.language });
  let pos = startPos;
  for (const sp of spots) {
    const l = LESSONS[sp.id]!;
    const skill = skillOf(sp.id) ?? l.skill ?? "words";
    clock += (sp.pauseAt - pos) * 1000; // the show plays up to the pause
    pos = sp.pauseAt;
    const turnId = uuid();
    const base = { turnId, spotId: sp.id, question: l.question.slice(0, 300), skill: l.skill };
    const stage = (stageName: PlayEvent["stage"], extra: Partial<PlayEvent> = {}, afterMs = 0) =>
      add({ type: "stage", stage: stageName, tries: 0, nudges: 0, modeled: false, practiced: false, ...base, ...extra }, afterMs);
    const right = pick(l.accept.length ? l.accept : [l.answer || "that one"]);
    const wrong = pick(WRONG_BY_SKILL[skill] ?? ["um...", "I don't know", "that one?"]);
    stage("entering", { answer: l.type === "open" ? undefined : l.answer?.slice(0, 300), moment: Math.round(sp.pauseAt * 10) / 10 });
    stage("asking", {}, 300);
    stage("listening", {}, 250);

    // How it goes: right first time more often as the days go by; remembering questions improve slowest.
    const skillful = Math.min(0.92, (RECALL.has(skill) ? 0.12 : 0.28) + progress * 0.62);
    const roll = rand();
    const outcome = l.type === "open" ? "first_try" : roll < skillful ? "first_try" : roll < skillful + 0.22 ? "after_help" : roll < 0.96 ? "gave" : "no_answer";
    const heard = (text: string, afterMs: number) => {
      add({ type: "heard", ...base, text, ms: Math.round(between(420, 650)) }, afterMs);
    };
    const judged = (verdict: "correct" | "wrong", afterMs: number) =>
      add({ type: "judged", ...base, verdict, source: verdict === "correct" && rand() < 0.6 ? "instant" : "luna", ms: Math.round(between(600, 1050)), say: verdict === "wrong" ? pick(HINTS) : undefined }, afterMs);

    if (l.type === "say") {
      // "Say it" moments are scored by sound.
      const verdict = outcome === "first_try" || outcome === "after_help" ? pick(["good", "good", "close"] as const) : "retry";
      add({ type: "pronounced", ...base, verdict, ms: Math.round(between(300, 380)) }, between(2200, 3600));
      if (verdict === "retry") { stage("thinking", {}, 40); stage("giving", { modeled: true }, 400); }
      else { stage("thinking", {}, 40); stage("celebrating", {}, 300); }
    } else if (outcome === "first_try") {
      stage("thinking", {}, between(1800, 3800));
      heard(l.type === "open" ? pick(["a firefighter!", "a doctor", "an explorer like Dora!", "a painter"]) : right, 500);
      judged("correct", 300);
      stage("celebrating", {}, 120);
    } else if (outcome === "after_help") {
      stage("thinking", {}, between(2000, 4000));
      heard(wrong, 500);
      judged("wrong", 800);
      stage("teaching", { tries: 1 }, 100);
      stage("listening", { tries: 1 }, between(3500, 5000));
      stage("thinking", { tries: 1 }, between(1500, 3500));
      heard(right, 500);
      judged("correct", 300);
      stage("celebrating", { tries: 1 }, 120);
    } else if (outcome === "gave") {
      stage("thinking", {}, between(2000, 4000));
      heard(wrong, 500);
      judged("wrong", 800);
      stage("teaching", { tries: 1 }, 100);
      stage("listening", { tries: 1 }, between(3500, 5000));
      stage("thinking", { tries: 1 }, between(1500, 3000));
      heard(pick(["um...", wrong, "I don't know"]), 500);
      judged("wrong", 800);
      stage("modeling", { tries: 2 }, 100);
      stage("giving", { tries: 2, modeled: true }, between(5000, 7000));
    } else {
      stage("nudging", { nudges: 1 }, 7500);
      stage("listening", { nudges: 1 }, 2500);
      stage("modeling", { nudges: 1 }, 7500);
      stage("giving", { nudges: 1, modeled: true }, between(5000, 6500));
    }

    // Then the word in the language being learned (not for "say it" moments, which already were one).
    const word = WORDS[sp.id]?.[v.language]?.word;
    if (word && l.type !== "say") {
      stage("practicing", { word: word.slice(0, 60) }, between(3200, 3700));
      stage("listening", { practiced: true }, between(3500, 4500));
      const before = practicedGood.get(`${v.language}|${word}`) ?? 0;
      const good = rand() < Math.min(0.9, 0.45 + 0.2 * before + progress * 0.15);
      add({ type: "pronounced", ...base, verdict: good ? pick(["good", "close"] as const) : "retry", ms: Math.round(between(300, 380)) }, between(1800, 3200));
      stage("thinking", { practiced: true }, 40);
      if (good) {
        practicedGood.set(`${v.language}|${word}`, before + 1);
        stage("celebrating", { practiced: true }, 350);
      } else stage("giving", { practiced: true }, 350);
    }
    stage("exiting", {}, between(2800, 3600));
    add({ type: "stage", stage: "watching", spotId: sp.id }, 400);
  }
  const tail = between(40, 180); // keeps watching a little after the last moment
  add({ type: "session_end", watchedSeconds: Math.round(pos - startPos + tail) }, tail * 1000);
  return { sessionId, events };
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema }) as unknown as StoreDb;
try {
  const existing = await client`select count(*)::int as n from play_sessions`;
  if (existing[0]!.n > 0 && !process.argv.includes("--reset")) {
    console.error(`play_sessions already has ${existing[0]!.n} viewings. Re-run with --reset to clear Play data first.`);
    process.exit(1);
  }
  if (process.argv.includes("--reset")) {
    await client.begin(async (tx) => {
      for (const t of ["play_turns", "play_events", "play_sessions", "lesson_progress", "mastery_resets"]) await tx.unsafe(`delete from "${t}"`);
    });
  }
  const store = createPostgresPlayStore(db);
  let turns = 0;
  for (const [i, v] of VIEWINGS.entries()) {
    const { sessionId, events } = viewing(v, i / (VIEWINGS.length - 1));
    for (let at = 0; at < events.length; at += 200) {
      const record = await store.ingest({ sessionId, episodeId: episode.id, events: events.slice(at, at + 200) });
      if (at + 200 >= events.length) turns += record.turns.length;
    }
  }
  console.log(`Seeded ${VIEWINGS.length} viewings, ${turns} answered moments.`);
} finally {
  await client.end();
}
