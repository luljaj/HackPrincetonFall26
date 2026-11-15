import type { Mastery, SkillLevel, WordLevel } from "../../../lib/play/mastery";
import { languageName } from "../../../lib/play/view";
import { shortDate } from "./parts";

// What the child can do, from real play (learning-plan.md): each category's skills with a level, and a
// word list per language being learned.
const SKILL: Record<SkillLevel, { label: string; cls: string }> = {
  new: { label: "Not yet", cls: "bg-foreground/5 text-foreground/45" },
  practising: { label: "Practising", cls: "bg-[#fff3d6] text-[#8a5a00]" },
  got_it: { label: "Got it", cls: "bg-[#dff5e6] text-[#1d6b3a]" },
  rusty: { label: "Needs a refresh", cls: "bg-[#fde4e1] text-[#9b2c1f]" },
};
const WORD: Record<WordLevel, { label: string; cls: string }> = {
  heard: { label: "Heard", cls: "bg-foreground/5 text-foreground/60" },
  said: { label: "Said", cls: "bg-[#fff3d6] text-[#8a5a00]" },
  remembered: { label: "Remembered", cls: "bg-[#dff5e6] text-[#1d6b3a]" },
};
const when = (ms: number) => shortDate(new Date(ms).toISOString());

export function MasterySection({ mastery, name }: { mastery: Mastery; name: string }) {
  return (
    <section className="space-y-4 rounded-[24px] bg-[#f9f9fb] p-5" aria-labelledby="mastery-title">
      <h2 id="mastery-title" className="text-[19px] tracking-tight">
        What {name} can do
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {mastery.categories.map((c) => (
          <div key={c.id} className="space-y-2 rounded-xl border border-line bg-white p-3">
            <b className="font-semibold">{c.name}</b>
            <ul className="grid gap-1.5">
              {c.skills.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span title={s.asked ? `${s.firstTry} of ${s.asked} before help${s.lastSeen ? ` · last ${when(s.lastSeen)}` : ""}` : undefined}>
                    {s.name}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${SKILL[s.level].cls}`}>{SKILL[s.level].label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h3 className="pt-1 text-[17px] tracking-tight">Languages</h3>
      {mastery.languages.length === 0 ? (
        <p className="text-sm text-foreground/60">No language practice yet. Pick a language on the TV or in the learning plan.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mastery.languages.map((l) => (
            <div key={l.language} className="space-y-2 rounded-xl border border-line bg-white p-3">
              <b className="font-semibold">{languageName(l.language)}</b>
              <ul className="flex flex-wrap gap-1.5">
                {l.words.map((w) => (
                  <li key={w.word} className={`rounded-full px-2.5 py-1 text-sm ${WORD[w.level].cls}`} title={`${WORD[w.level].label} · last ${when(w.lastSeen)}`}>
                    {w.word}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
