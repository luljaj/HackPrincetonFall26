"use client";

import { useEffect, useRef, useState } from "react";
import { MasteryCarousel } from "./mastery-carousel";
import { z } from "zod";
import { LanguageLessonSchema, LESSONS_EVENT, LESSON_LEVELS, LessonLevelSchema, type LanguageCode, type LanguageLesson, type LessonWrite } from "../../../lib/play/language-lessons";
const ResponseSchema = z.object({ lessons: z.array(LanguageLessonSchema) });

export function useLanguageLessons(language: LanguageCode | null) {
  const revision = useRef(0);
  const saving = useRef(false);
  const [snapshot, setSnapshot] = useState<{ language: LanguageCode; lessons: LanguageLesson[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!language) return;
    const controller = new AbortController();
    let reading = false;
    const read = async () => {
      if (reading || saving.current) return;
      const version = revision.current;
      reading = true;
      try {
        const response = await fetch(`/api/parent/lessons?language=${language}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = ResponseSchema.parse(await response.json());
        if (!controller.signal.aborted && version === revision.current) { setSnapshot({ language, lessons: data.lessons }); setError(null); }
      } catch { if (!controller.signal.aborted) setError("Couldn't load the saved lessons. Retrying…"); }
      finally { reading = false; }
    };
    void read();
    const onChange = () => { void read(); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void read(); }, 2000);
    window.addEventListener(LESSONS_EVENT, onChange);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener(LESSONS_EVENT, onChange); };
  }, [language]);
  async function save(lesson: LanguageLesson, patch: Pick<LessonWrite, "level" | "active"> | "recorded") {
    revision.current++; saving.current = true;
    setBusy(lesson.lessonId); setError(null);
    try {
      const response = await fetch("/api/parent/lessons", { method: patch === "recorded" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lesson.language, lessonId: lesson.lessonId, ...(patch === "recorded" ? {} : patch) }) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (patch === "recorded") { const lessons = ResponseSchema.parse(data).lessons; setSnapshot(previous => previous?.language === lesson.language ? { language: lesson.language, lessons } : previous); }
      else {
        const updated = LanguageLessonSchema.parse(data.lesson);
        setSnapshot(previous => previous?.language === lesson.language ? { ...previous, lessons: previous.lessons.map(row => row.lessonId === updated.lessonId ? updated : row) } : previous);
      }
    } catch { setError("That lesson change wasn't saved. Please try again."); }
    finally { saving.current = false; setBusy(null); window.dispatchEvent(new Event(LESSONS_EVENT)); }
  }
  async function practice(lesson: LanguageLesson) {
    setBusy(lesson.lessonId); setError(null);
    try {
      const response = await fetch("/api/parent/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: lesson.language, lessonId: lesson.lessonId }) });
      if (!response.ok) throw new Error();
    } catch { setError("The TV couldn't receive that lesson. Try again."); }
    finally { setBusy(null); }
  }
  return { lessons: snapshot?.language === language ? snapshot.lessons : [], loading: !!language && snapshot?.language !== language, busy, error, save, practice };
}

type State = ReturnType<typeof useLanguageLessons>;
export function LanguageLessonControls({ state, name }: { state: State; name: string }) {
  const visible = state.lessons.filter(row => row.active);
  const removed = state.lessons.filter(row => !row.active);
  function row(lesson: LanguageLesson) {
    return <article key={lesson.lessonId} className="language-lesson" data-lesson-id={lesson.lessonId}>
      <div><b>{lesson.word}</b><span>{lesson.english}</span><small>{lesson.source === "parent" ? "Parent-set level" : lesson.source === "recorded" ? "From saved practice" : "Not practised yet"}</small></div>
      <p className="mastery-card-blurb">Practise “{lesson.word}” ({lesson.english}) in the story. {lesson.question}</p>
      <div className="language-lesson-actions">
        <label className="sr-only" htmlFor={`level-${lesson.language}-${lesson.lessonId}`}>Level for {lesson.english}</label>
        <select id={`level-${lesson.language}-${lesson.lessonId}`} value={lesson.level} disabled={state.busy !== null}
          onChange={event => { void state.save(lesson, { level: LessonLevelSchema.parse(Number(event.target.value)) }); }}>
          {LESSON_LEVELS.map((label, level) => <option key={label} value={level}>{level} · {label}</option>)}
        </select>
        {lesson.active && <button disabled={state.busy !== null} onClick={() => { void state.practice(lesson); }}>Practise on TV</button>}
        {lesson.active ? <button disabled={state.busy !== null} onClick={() => { void state.save(lesson, { active: false }); }}>Remove</button>
          : <button disabled={state.busy !== null} onClick={() => { void state.save(lesson, { active: true }); }}>Add lesson</button>}
        {lesson.source === "parent" && <button disabled={state.busy !== null} onClick={() => { void state.save(lesson, "recorded"); }}>Use recorded progress</button>}
      </div>
    </article>;
  }
  return <>
    <p className="mt-3 text-xs text-foreground/60">{name}&apos;s levels stay saved when you switch languages. A parent can raise or lower any level.</p>
    {state.error && <p role="alert" className="mt-3 text-sm text-[#9b3644]">{state.error}</p>}
    {state.loading ? <p role="status" className="mt-4 text-sm">Loading saved lessons…</p> : <>
      <p className="mt-4 text-sm">{visible.filter(l => l.level === 3).length}/{visible.length} lessons remembered</p>
      <MasteryCarousel key={visible.map(l => l.lessonId).join(",")} label="Lessons">{visible.map(row)}</MasteryCarousel>
      {removed.length > 0 && <details className="mt-4 text-sm"><summary>Removed lessons ({removed.length})</summary><div className="language-lesson-list">{removed.map(row)}</div></details>}
    </>}
  </>;
}
