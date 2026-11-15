import OpenAI from "openai";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getPlayStore, getLanguageLessonStore } from "../storage";
import { skillOf } from "../../lib/play/mastery";
import { LanguageCodeSchema } from "../../lib/play/language-lessons";
import { readProviderConfig } from "../pipeline/config";

const Analysis = z.object({ summary: z.string().max(350), pattern: z.string().max(300), nextStep: z.string().max(300), uncertainty: z.string().max(200), evidenceIds: z.array(z.string()).max(4) });
const cache = new Map<string, Promise<z.infer<typeof Analysis>>>();
let client: OpenAI | null = null;
export async function learningAnalysis(subject: string) {
  const store = getPlayStore();
  const [mastery, records, legacy] = await Promise.all([store.mastery(), store.list(100), store.legacyEvidence()]);
  const category = mastery.categories.find(c => c.id === subject);
  const language = LanguageCodeSchema.safeParse(subject.replace(/^language:/,""));
  const lessonState = language.success ? await getLanguageLessonStore().list(language.data) : null;
  const skillIds = new Set(category?.skills.map(s => s.id) ?? []);
  const all = [...records.flatMap(r => r.turns.map(t => ({ ...t, sessionId: r.session.sessionId }))), ...legacy];
  const evidence = all.filter(t => (language.success ? t.practiceLanguage === language.data && !!t.practiceOutcome : !!t.outcome && ["first_try", "after_help", "gave", "no_answer"].includes(t.outcome) && skillIds.has(skillOf(t.spotId) ?? "")))
    .sort((a,b) => b.endedAt-a.endedAt).slice(0,12).map(t => ({ id: `${t.sessionId}:${t.turnId}`, question: t.question, childSaid: t.transcript.slice(0,300), answerStatus: t.answerStatus, outcome: t.outcome, assessment: t.outcome === "first_try" ? "Correct independently" : t.outcome === "after_help" ? "Correct after help" : t.outcome === "gave" ? "Not independently correct; Dora supplied the answer" : "No assessed correct answer", practiceOutcome: t.practiceOutcome, at: t.endedAt }));
  const source = { independentCorrectAnswers: evidence.filter(e => e.outcome === "first_try").length, correctAfterHelp: evidence.filter(e => e.outcome === "after_help").length, subject: category?.name ?? (language.success ? language.data : subject), skills: category?.skills.map(skill => ({ ...skill, levelSource: "computed from saved answers" })) ?? [], lessons: lessonState?.map(l => ({ word: l.word, level: l.level, source: l.source, active: l.active })), evidence };
  const version = createHash("sha256").update(JSON.stringify(source)).digest("hex");
  if (!evidence.length) return { source: "saved-data" as const, version, evidenceCount: 0, summary: "There are no saved assessed answers for this subject yet.", pattern: "", nextStep: language.success ? "Start a language lesson on the TV; its practice will be saved here." : "Try a prepared question for this subject on the TV.", uncertainty: "A lesson being played is different from a saved answer.", evidenceIds: [] };
  let pending = cache.get(version);
  if (!pending) {
    pending = (async () => {
      const config = readProviderConfig();
      client ??= new OpenAI({ apiKey: config.apiKey, timeout: 30_000, maxRetries: 1 });
      const response = await client.responses.create({ model: config.lunaModel, store: false, max_output_tokens: 1200, reasoning: { effort: "low" },
        instructions: "Analyze this child's saved learning evidence for the parent. Use ONLY the provided facts. Quote reasoning only if the transcript says it. Distinguish correct independent answers, help and no answer. childSaid is ONLY the recorded child transcript, never Dora speech or the correct answer. Do not claim Dora said a transcript or claim the correct answer unless supplied. Use each assessment as authoritative: a transcript alone does not establish correctness. Never describe a gave outcome as independent success. Only language lessons explicitly tagged source=parent are parent-set edits. Category skill levels are always computed from saved answers, never call those parent-set. outcome=gave means Dora gave the answer, not that the child was silent. An empty transcript means speech was not saved, not necessarily silence. Do not diagnose attention, ability or motivation, or claim grade placement. Say when the sample is small or unclear. Recommend ONE concrete next teaching step addressing the observed response. Never invent counts, quotes, skills or causes. evidenceIds must refer only to input ids. Return concise, plain language.",
        input: JSON.stringify(source), text: { format: { type: "json_schema", name: "learning_analysis", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["summary","pattern","nextStep","uncertainty","evidenceIds"], properties: {
            summary: { type:"string" }, pattern:{type:"string"}, nextStep:{type:"string"}, uncertainty:{type:"string"}, evidenceIds:{type:"array",items:{type:"string",enum:evidence.map(e=>e.id)}} } } } },
      });
      const analysis = Analysis.parse(JSON.parse(response.output_text));
      if (analysis.evidenceIds.some(id => !evidence.some(e => e.id === id))) throw new Error("Unsupported evidence");
      if (!lessonState?.some(l => l.source === "parent") && /parent[- ]set|parent.s edit/i.test(JSON.stringify(analysis))) throw new Error("Unsupported parent-edit claim");
      return analysis;
    })();
    cache.set(version, pending);
    if (cache.size > 32) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
  }
  try { return { ...await pending, source: "luna" as const, version, evidenceCount: evidence.length }; }
  catch (error) { cache.delete(version); throw error; }
}
