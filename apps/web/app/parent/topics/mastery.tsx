"use client";

import { useEffect, useRef, useState } from "react";
import type { Mastery, SkillLevel, WordLevel } from "../../../lib/play/mastery";
import { subscribeToPlan } from "../../../lib/parent/subscribe";
import { LanguageCodeSchema, LANGUAGE_NAMES } from "../../../lib/play/language-lessons";
import { LearningAnalysis } from "./learning-analysis";
import { LanguageLessonControls, useLanguageLessons } from "./language-lessons";
import type { PlayTurn } from "../../../lib/play/trace";
import { categoryProgress } from "../../../lib/parent/mastery-chart";
import { languageName } from "../../../lib/play/view";
import { shortDate } from "./parts";

const SKILL: Record<SkillLevel, string> = { new: "Not yet", practising: "Practising", got_it: "Mastery", rusty: "Needs a refresh" };
const SKILL_DESCRIPTION: Record<string, string> = {
  "count-to-5": "Practises counting small groups of up to five objects, one at a time.",
  "count-to-10": "Practises keeping numbers in order while counting groups of up to ten.",
  "how-many": "Connects counting a group of objects with saying its total.",
  "add-small-numbers": "Combines two small groups and works out how many there are altogether.",
  "name-shapes": "Recognises and names shapes that appear in the story.",
  "match-shapes": "Looks at a shape and finds the space or object it matches.",
  "recall-places": "Remembers the stops on the map and the order of the journey.",
  "recall-events": "Recalls something that just happened to follow the story.",
  "recall-objects": "Remembers an object introduced earlier and brings it back to mind.",
  "pick-place": "Uses clues from the story to choose where to go next.",
  "pick-object": "Chooses the object that can help with the current task.",
  "explain-choice": "Practises giving a reason for a choice in the story.",
  "name-things": "Connects familiar objects in the scene with their names.",
  "action-words": "Practises words that describe movement and direction.",
  "describe-things": "Uses details such as colour, size and appearance to describe an object.",
  "what-next": "Uses what has happened so far to suggest what might happen next.",
  "feelings": "Notices clues about a character’s feelings and names those emotions.",
  "imagine": "Imagines possibilities and puts those ideas into words.",
  "answer-aloud": "Practises responding out loud when a character asks for help.",
  "chant": "Joins in with familiar words and repeated phrases from the show.",
  "do-action": "Follows a prompt to join in with an action from the story.",
  "spanish-words": "Practises the Spanish words and phrases Dora introduces in the story.",
};
const WORD: Record<WordLevel, string> = { heard: "Heard", said: "Said", remembered: "Remembered" };
type Evidence = Pick<PlayTurn, "turnId" | "question" | "transcript" | "outcome" | "endedAt"> & { answerStatus: string; skillId: string | null; episode: string };
const PETALS = [
  { id: "numbers", color: "#3b52f5", label: "Numbers", base: "68-2338", box: [110.3, 0, 193.234, 160.364], fill: "68-2343", fillBox: [131.64, 72.3, 112.307, 98.2983], radius: 79, labelAt: [204.5, 37] },
  { id: "shapes", color: "#61bd28", label: "Shapes", base: "68-2337", box: [176.79, 106.29, 160.201, 194.597], fill: "68-2342", fillBox: [167.02, 116.55, 129.675, 151.802], radius: 110.5, labelAt: [294.5, 204] },
  { id: "show-spanish", color: "#ff8000", label: "Spanish", base: "68-2455", box: [32.92, 176.59, 192.933, 160.401], fill: "68-2345", fillBox: [69.52, 166.37, 146.289, 126.319], radius: 107.5, labelAt: [127.5, 290] },
  { id: "remembering", color: "#dbbb12", label: "Remembering", base: "68-2339", box: [0, 32.76, 160.411, 192.851], fill: "68-2344", fillBox: [4.3, 35.91, 165.322, 193.612], radius: 147, labelAt: [45, 122] },
] as const;
const when = (ms: number) => shortDate(new Date(ms).toISOString());

/* eslint-disable @next/next/no-img-element -- Original Figma SVG assets retain their intrinsic geometry. */
export function MasterySection({ mastery, name, evidence = [], initialLanguage = "" }: { mastery: Mastery; name: string; evidence?: Evidence[]; initialLanguage?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [language, setLanguage] = useState(initialLanguage);
  const lastLanguage = useRef(initialLanguage);
  useEffect(() => subscribeToPlan(plan => {
    if (typeof plan.language !== "string" || plan.language === lastLanguage.current) return;
    lastLanguage.current = plan.language;
    setLanguage(plan.language);
    setSelected(LanguageCodeSchema.safeParse(plan.language).success ? `language:${plan.language}` : null);
  }) ?? undefined, []);
  const parsedLanguage = LanguageCodeSchema.safeParse(language);
  const languageCode = parsedLanguage.success ? parsedLanguage.data : null;
  const languageState = useLanguageLessons(languageCode);
  const languageId = `language:${languageCode ?? ""}`;
  const languageCategory = languageCode ? { id: languageId, name: LANGUAGE_NAMES[languageCode], skills: languageState.lessons.filter(row => row.active).map(row => ({
    id: row.lessonId, name: row.word, level: row.level === 3 ? "got_it" as const : row.level > 0 ? "practising" as const : "new" as const,
    asked: 0, firstTry: 0, lastSeen: row.updatedAt,
  })) } : null;
  const petals = PETALS.map(petal => petal.id === "show-spanish" && languageCategory ? { ...petal, id: languageCategory.id, label: languageCategory.name } : petal);
  const categories = [...mastery.categories.filter(c => !languageCategory || c.id !== "show-spanish"), ...(languageCategory ? [languageCategory] : [])];
  const category = categories.find(c => c.id === selected) ?? (selected === "show-spanish" || selected?.startsWith("language:") ? languageCategory : undefined);
  const isLanguage = !!languageCategory && category?.id === languageCategory.id;
  if (!mastery.categories.length) return <p>No skills are available yet.</p>;
  const skills = new Set(category?.skills.map(s => s.id) ?? []);
  const turns = evidence.filter(t => t.skillId && skills.has(t.skillId) && t.outcome && ["first_try", "after_help", "gave", "no_answer"].includes(t.outcome));
  const shown = expanded ? turns : turns.slice(0, 2);
  const asked = category?.skills.reduce((n, s) => n + s.asked, 0) ?? 0;
  const spanish = category?.id === "show-spanish";
  return (
    <div>
      <h2 className="parent-heading" id="mastery-title">Mastery</h2>
      <section className="mastery-surface" aria-labelledby="mastery-title">
        <div className="mastery-map-wrap">
          <div className="mastery-map" role="group" aria-label="Choose a learning subject">
            <svg className="mastery-flower" viewBox="0 0 337 337" aria-hidden="true">
            {petals.map(petal => {
              const subject = categories.find(c => c.id === petal.id);
              if (!subject) return null;
              const progress = categoryProgress(subject);
              if (subject.id === languageId && languageState.lessons.length) { const active = languageState.lessons.filter(l => l.active); progress.fraction = active.length ? active.reduce((n,l) => n + l.level / 3, 0) / active.length : 0; }
              const scale = 154 / petal.radius * Math.sqrt(progress.fraction);
              return <g key={petal.id} data-subject={petal.base === "68-2455" ? "show-spanish" : petal.id} data-selected={subject.id === category?.id} style={{ color: petal.color }}>
                  <image className="petal-base" href={`/figma/petal-${petal.base}.svg`} x={petal.box[0]} y={petal.box[1]} width={petal.box[2]} height={petal.box[3]} />
                  {progress.fraction > 0 && <g transform={`translate(168.5 168.5) scale(${scale}) translate(-168.5 -168.5)`}>
                    <image href={`/figma/petal-${petal.fill}.svg`} x={petal.fillBox[0]} y={petal.fillBox[1]} width={petal.fillBox[2]} height={petal.fillBox[3]} />
                  </g>}
                  <text className="petal-count" x={petal.labelAt[0]} y={petal.labelAt[1]} textAnchor="middle">{progress.gotIt}/{progress.total}</text>
                  <text className="petal-label" x={petal.labelAt[0]} y={petal.labelAt[1] + 21} textAnchor="middle" data-long={petal.id === "remembering"}>{petal.label}</text>
              </g>;
            })}
            </svg>
            {petals.map(petal => {
              const subject = categories.find(c => c.id === petal.id);
              if (!subject) return null;
              const progress = categoryProgress(subject);
              if (subject.id === languageId && languageState.lessons.length) { const active = languageState.lessons.filter(l => l.active); progress.fraction = active.length ? active.reduce((n,l) => n + l.level / 3, 0) / active.length : 0; }
              return <button key={petal.id} type="button" data-subject={petal.base === "68-2455" ? "show-spanish" : petal.id}
                aria-label={`${petal.label}: ${progress.gotIt} of ${progress.total} skills at mastery`} aria-pressed={subject.id === category?.id}
                onClick={() => { setSelected(subject.id); setExpanded(false); }} />;
            })}
          </div>
        </div>
        <div className="mastery-detail">
          <div className="mastery-detail-content" key={category?.id ?? "empty"}>
          {isLanguage ? <><SubjectHeader icon="/figma/mastery-imgSpanish1.svg" title={languageCategory?.name ?? ""} subtitle="Learning language" /><LanguageLessonControls state={languageState} name={name} /></> : category ? <>
          <SubjectHeader icon={spanish ? "/figma/mastery-imgSpanish1.svg" : "/figma/mastery-imgMastery1.svg"} title={category.name}
            subtitle={`${category.skills.filter(s => s.level === "got_it").length} of ${category.skills.length} mastered${asked ? ` · ${asked} question${asked === 1 ? "" : "s"}` : ""}`}
            current={(category.skills.find(s => s.level === "practising" || s.level === "rusty") ?? category.skills.find(s => s.level === "new"))?.name} />
          <SkillTrack skills={category.skills} color={PETALS.find(p => p.id === category.id)?.color ?? "#ff8000"} />
          <ul className="mastery-skill-list">{category.skills.map(s => <li key={s.id} className="mastery-skill-card">
            <div><h4>{s.name}</h4><span className="mastery-badge" data-good={s.level === "got_it"}>{SKILL[s.level]}</span></div>
            {SKILL_DESCRIPTION[s.id] && <p>{SKILL_DESCRIPTION[s.id]}</p>}
            {s.asked > 0 && <small>{s.firstTry}/{s.asked} on own{s.lastSeen ? ` · ${when(s.lastSeen)}` : ""}</small>}
          </li>)}</ul>
          {shown.length ? <>
            <h4 className="mt-4 text-sm font-medium">Questions practised</h4>
            <ul className="mastery-evidence">
              {shown.map(t => <li key={t.turnId}>
                <header>
                  <b><img src="/figma/mastery-imgFrame75.svg" alt="" />{category.skills.find(s => s.id === t.skillId)?.name}</b>
                  <span className="mastery-badge" data-good={t.outcome === "first_try"}>
                    <img src={t.outcome === "first_try" ? "/figma/mastery-imgAkarIconsCircleCheckFill.svg" : "/figma/mastery-imgPuzzledSmileyStreamlineFlex1Vectorized.svg"} alt="" />
                    {t.outcome === "first_try" ? "Answered independently" : t.outcome === "after_help" ? "Answered after help" : t.outcome === "gave" ? "Needed the answer" : "No clear answer"}
                  </span>
                </header>
                <p>Q: {t.question}</p>
                <blockquote>{t.transcript ? `“${t.transcript}”` : "No speech saved."}</blockquote>
                <time dateTime={new Date(t.endedAt).toISOString()}>{when(t.endedAt)} · {t.episode}</time>
              </li>)}
            </ul>
            {turns.length > 2 && <button className="mt-3 w-full cursor-pointer text-xs" onClick={() => setExpanded(!expanded)}>{expanded ? "− See less" : `+ See more (${turns.length - 2})`}</button>}
          </> : null}
          </> : <div className="mastery-empty">
            <img src="/figma/mastery-select-subject.svg" alt="" width={32} height={32} />
            <p>Select a subject to view skills</p>
          </div>}
          {category && <LearningAnalysis key={category.id} subject={category.id} version={`${mastery.categories.flatMap(c => c.skills).map(s => `${s.asked}:${s.lastSeen}`).join(",")}:${languageState.lessons.map(l => `${l.level}:${l.updatedAt}`).join(",")}`} />}
          </div>
        </div>
      </section>
      <section className="mt-8 space-y-3" aria-label="Other subjects">
        <h3 className="text-xl">Other subjects</h3>
        <div className="mastery-other-subjects">{mastery.categories.filter(c => !PETALS.some(p => p.id === c.id)).map(c => <button type="button" key={c.id} aria-pressed={c.id === selected}
          onClick={() => { setSelected(c.id); setExpanded(false); document.getElementById("mastery-title")?.scrollIntoView({ block: "start" }); }}>
          <span>{c.name}</span><small>{categoryProgress(c).gotIt}/{c.skills.length} skills at mastery</small>
        </button>)}</div>
      </section>
      <section className="mt-8 space-y-3" aria-label="Language practice">
        <h3 className="text-xl">Languages</h3>
        {mastery.languages.length === 0 ? <p className="text-sm text-foreground/60">No language practice yet. Pick a language on the TV or in the learning plan.</p> :
          <div className="grid gap-3 sm:grid-cols-2">{mastery.languages.map(l => <div key={l.language} className="rounded-2xl border border-white bg-white/65 p-4">
            <b className="text-sm">{languageName(l.language)}</b>
            <ul className="mt-3 flex flex-wrap gap-2">{l.words.map(w => <li key={w.word} className="rounded-lg bg-white px-3 py-2 text-sm" title={`Last ${when(w.lastSeen)}`}>{w.word} <small className="text-foreground/55">{WORD[w.level]}</small></li>)}</ul>
          </div>)}</div>}
      </section>
    </div>
  );
}

/** Subject header: icon tile, name, one short summary line, and the skill being worked on now. */
function SubjectHeader({ icon, title, subtitle, current }: { icon: string; title: string; subtitle: string; current?: string }) {
  return <header className="mastery-subject">
    <span className="mastery-subject-tile"><img src={icon} alt="" /></span>
    <div>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {current && <p className="mastery-subject-current"><i aria-hidden="true" />{current}</p>}
    </div>
  </header>;
}

type TrackSkill = { id: string; level: SkillLevel };
/** One segment per skill: mastered segments fill, the current one fills partway with a marker. */
function SkillTrack({ skills, color }: { skills: TrackSkill[]; color: string }) {
  const current = (skills.find(s => s.level === "practising" || s.level === "rusty") ?? skills.find(s => s.level === "new"))?.id;
  return <div className="mastery-track" aria-hidden="true" style={{ "--track": color } as React.CSSProperties}>
    {skills.map(s => {
      const fill = s.level === "got_it" ? 100 : s.level === "practising" ? 60 : s.level === "rusty" ? 35 : 0;
      return <span key={s.id} data-level={s.level} style={{ "--fill": `${fill}%` } as React.CSSProperties}>
        {s.id === current && <b />}
      </span>;
    })}
  </div>;
}
