"use client";

import { useState } from "react";
import type { Mastery, SkillLevel, WordLevel } from "../../../lib/play/mastery";
import type { PlayTurn } from "../../../lib/play/trace";
import { categoryProgress } from "../../../lib/parent/mastery-chart";
import { languageName } from "../../../lib/play/view";
import { shortDate } from "./parts";

const SKILL: Record<SkillLevel, string> = { new: "Not yet", practising: "Practising", got_it: "Got it", rusty: "Needs a refresh" };
const WORD: Record<WordLevel, string> = { heard: "Heard", said: "Said", remembered: "Remembered" };
type Evidence = PlayTurn & { skillId: string | null; episode: string };
const PETALS = [
  { id: "numbers", color: "#3b52f5", label: "Numbers", base: "68-2338", box: [110.3, 0, 193.234, 160.364], fill: "68-2343", fillBox: [131.64, 72.3, 112.307, 98.2983], radius: 79, labelAt: [204.5, 37] },
  { id: "shapes", color: "#61bd28", label: "Shapes", base: "68-2337", box: [176.79, 106.29, 160.201, 194.597], fill: "68-2342", fillBox: [167.02, 116.55, 129.675, 151.802], radius: 110.5, labelAt: [294.5, 204] },
  { id: "show-spanish", color: "#ff8000", label: "Spanish", base: "68-2455", box: [32.92, 176.59, 192.933, 160.401], fill: "68-2345", fillBox: [69.52, 166.37, 146.289, 126.319], radius: 107.5, labelAt: [127.5, 290] },
  { id: "remembering", color: "#dbbb12", label: "Remembering", base: "68-2339", box: [0, 32.76, 160.411, 192.851], fill: "68-2344", fillBox: [4.3, 35.91, 165.322, 193.612], radius: 147, labelAt: [45, 122] },
] as const;
const when = (ms: number) => shortDate(new Date(ms).toISOString());

/* eslint-disable @next/next/no-img-element -- Original Figma SVG assets retain their intrinsic geometry. */
export function MasterySection({ mastery, name, evidence = [] }: { mastery: Mastery; name: string; evidence?: Evidence[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const category = mastery.categories.find(c => c.id === selected);
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
            {PETALS.map(petal => {
              const subject = mastery.categories.find(c => c.id === petal.id);
              if (!subject) return null;
              const progress = categoryProgress(subject);
              const scale = 154 / petal.radius * Math.sqrt(progress.fraction);
              return <g key={petal.id} data-subject={petal.id} data-selected={subject.id === selected} style={{ color: petal.color }}>
                  <image className="petal-base" href={`/figma/petal-${petal.base}.svg`} x={petal.box[0]} y={petal.box[1]} width={petal.box[2]} height={petal.box[3]} />
                  {progress.fraction > 0 && <g transform={`translate(168.5 168.5) scale(${scale}) translate(-168.5 -168.5)`}>
                    <image href={`/figma/petal-${petal.fill}.svg`} x={petal.fillBox[0]} y={petal.fillBox[1]} width={petal.fillBox[2]} height={petal.fillBox[3]} />
                  </g>}
                  <text className="petal-count" x={petal.labelAt[0]} y={petal.labelAt[1]} textAnchor="middle">{progress.gotIt}/{progress.total}</text>
                  <text className="petal-label" x={petal.labelAt[0]} y={petal.labelAt[1] + 21} textAnchor="middle" data-long={petal.id === "remembering"}>{petal.label}</text>
              </g>;
            })}
            </svg>
            {PETALS.map(petal => {
              const subject = mastery.categories.find(c => c.id === petal.id);
              if (!subject) return null;
              const progress = categoryProgress(subject);
              return <button key={petal.id} type="button" data-subject={petal.id}
                aria-label={`${petal.label}: ${progress.gotIt} of ${progress.total} skills at Got it`} aria-pressed={subject.id === selected}
                onClick={() => { setSelected(subject.id); setExpanded(false); }} />;
            })}
          </div>
          <p className="mastery-map-note">Skills at “Got it” · tap a petal</p>
        </div>
        <div className="mastery-detail" aria-live="polite">
          {category ? <><header>
            {spanish ? <span className="mastery-subject-icon"><img src="/figma/mastery-imgSpanish1.svg" alt="" /></span>
              : <img src="/figma/mastery-imgMastery1.svg" alt="" width={24} height={24} />}
            <div><h3>{category.name}</h3><p>What {name} can do · saved learning evidence</p></div>
          </header>
          <div className="mastery-track" aria-hidden="true">{category.skills.map(s => <i key={s.id} data-level={s.level} />)}</div>
          <p className="text-xs text-foreground/60">{category.skills.filter(s => s.level === "got_it").length} of {category.skills.length} skills at “Got it”</p>
          <img className="mastery-divider" src="/figma/mastery-imgVector2.svg" alt="" />
          <h4 className="text-base">{asked} Questions Practised</h4>
          {shown.length ? <>
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
            {turns.length > 2 && <button className="mt-4 w-full cursor-pointer text-xs" onClick={() => setExpanded(!expanded)}>{expanded ? "− See less" : `+ See more (${turns.length - 2})`}</button>}
            <p className="mt-3 text-[10px] text-foreground/55">Saved history stays visible when progress is reset.</p>
          </> : <p className="mt-4 text-sm text-foreground/60">No saved questions for this subject yet.</p>}
          <img className="mastery-divider" src="/figma/mastery-imgVector2.svg" alt="" />
          <h4 className="text-base">Skills</h4>
          <ul className="mastery-skill-list">{category.skills.map(s => <li key={s.id}>
            <div>{s.name}<small className="mt-1 block text-foreground/55">{s.firstTry} of {s.asked} independently{s.lastSeen ? ` · last ${when(s.lastSeen)}` : ""}</small></div>
            <span>{SKILL[s.level]}</span>
          </li>)}</ul></> : <div className="mastery-empty">
            <img src="/figma/mastery-select-subject.svg" alt="" width={32} height={32} />
            <p>Select a subject to view skills</p>
          </div>}
        </div>
      </section>
      <section className="mt-8 space-y-3" aria-label="Other subjects">
        <h3 className="text-xl">Other subjects</h3>
        <div className="mastery-other-subjects">{mastery.categories.filter(c => !PETALS.some(p => p.id === c.id)).map(c => <button type="button" key={c.id} aria-pressed={c.id === selected}
          onClick={() => { setSelected(c.id); setExpanded(false); document.getElementById("mastery-title")?.scrollIntoView({ block: "start" }); }}>
          <span>{c.name}</span><small>{categoryProgress(c).gotIt}/{c.skills.length} skills at “Got it”</small>
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
