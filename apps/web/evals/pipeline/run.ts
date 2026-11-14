import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { performance } from "node:perf_hooks";
import OpenAI from "openai";
import { z } from "zod";
import { cases, offlineDraft, type EvalCase } from "./cases";
import { exampleScene } from "../../server/scenes/example.scene";
import { MemoryPipelineStore } from "../../server/storage/memory";
import { processTurn } from "../../server/pipeline/process-turn";
import { createSession } from "../../server/pipeline/session";
import { readProviderConfig } from "../../server/pipeline/config";
import { createLunaAdapter, LUNA_PROMPT_REVISION } from "../../server/pipeline/luna";
import { createTranscriptionAdapter } from "../../server/pipeline/transcribe";
import { PipelineError } from "../../server/pipeline/errors";
import type { PipelineDependencies, PipelineTrace } from "../../server/pipeline/types";

export const AudioCasesSchema = z.array(z.strictObject({
  id: z.string().min(1),
  audioPath: z.string().refine((value) => path.isAbsolute(value) && /\.(webm|wav|m4a|mp4)$/i.test(value), "Use an absolute supported audio fixture path."),
  notes: z.string().min(1),
  steps: z.array(z.strictObject({ transcript: z.string(), expected: z.enum(["correct", "incorrect", "unclear", "off_topic", "not_assessed"]) })).length(1),
})).max(20);

const webRoot = fileURLToPath(new URL("../../", import.meta.url));
export function loadLocalEnv() {
  // Existing shell values win, then .env.local, then .env. Never print values.
  for (const name of [".env.local", ".env"]) {
    const location = path.join(webRoot, name);
    if (existsSync(location)) process.loadEnvFile(location);
  }
}
export function timingSummary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? {
    medianMs: sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2,
    slowestMs: sorted.at(-1)!,
  } : { medianMs: null, slowestMs: null };
}
export async function evaluate(options: { live?: boolean; audioCases?: Array<EvalCase & { audioPath: string }> } = {}) {
  if (options.audioCases?.length && !options.live) throw new Error("Audio fixtures require --live; offline mode does not decode audio.");
  // No client construction or key validation in offline mode.
  const config = options.live ? readProviderConfig() : null;
  const client = config ? new OpenAI({ apiKey: config.apiKey, timeout: 30_000, maxRetries: 0 }) : null;
  const luna = client && config ? createLunaAdapter(client, config.lunaModel) : null;
  const transcribe = client && config ? createTranscriptionAdapter(client, config.transcriptionModel) : null;
  const outputs: Array<Record<string, unknown>> = [];
  const traces: PipelineTrace[] = [];
  let assessmentErrors = 0;
  let failures = 0;
  const allCases: Array<EvalCase & { audioPath?: string }> = [...cases, ...(options.audioCases ?? [])];
  for (const fixture of allCases) {
    const store = new MemoryPipelineStore();
    let currentTranscript = "";
    const caseTraces: PipelineTrace[] = [];
    const deps: PipelineDependencies = {
      store, createId: randomUUID,
      clock: { now: () => new Date().toISOString(), monotonicMs: () => performance.now() },
      promptRevision: options.live ? LUNA_PROMPT_REVISION : "offline-oracle-v1",
      luna: luna ?? (async (context) => ({ draft: offlineDraft(context), model: "offline-oracle" })),
      transcribe: fixture.audioPath ? transcribe! : async () => ({ transcript: currentTranscript, model: "synthetic-text-bypass" }),
      trace: (trace) => { traces.push(trace); caseTraces.push(trace); },
    };
    const session = await createSession({ sceneId: exampleScene.sceneId }, { ...deps, getScene: () => exampleScene });
    let questionId = session.question.questionId;
    for (const [index, step] of fixture.steps.entries()) {
      currentTranscript = step.transcript;
      try {
        const audio = fixture.audioPath ? new File([await readFile(fixture.audioPath)], path.basename(fixture.audioPath), {
          type: /\.wav$/i.test(fixture.audioPath) ? "audio/wav" : /\.(m4a|mp4)$/i.test(fixture.audioPath) ? "audio/mp4" : "audio/webm",
        }) : new File(["synthetic text bypass; never sent for transcription"], "synthetic.webm", { type: "audio/webm" });
        const result = await processTurn({ sessionId: session.sessionId, metadata: {
          interactionId: randomUUID(), questionId, expectedTurnNumber: index,
        }, audio }, deps);
        const mismatch = result.assessment.answerStatus !== step.expected;
        if (mismatch) assessmentErrors++;
        const saved = (await store.loadSession(session.sessionId))!;
        const record = saved.interactions.at(-1)!;
        // Additional hard assertions complement processTurn's schema/context guards.
        if (record.assessment.assistanceBeforeAnswer !== (exampleScene.assistanceAlreadyProvided || saved.interactions.slice(0, -1).some((turn) => turn.assistanceInResponse))) throw new Error("assistance attribution");
        if (!result.response.nextQuestion && index < fixture.steps.length - 1) throw new Error("closed before fixture finished");
        outputs.push({ caseId: fixture.id, step: index + 1, expected: step.expected, mismatch, notes: fixture.notes,
          response: result, record, trace: caseTraces.at(-1), spokenWords: result.response.text.split(/\s+/).length });
        if (result.response.nextQuestion) questionId = result.response.nextQuestion.questionId;
      } catch (error) {
        failures++;
        outputs.push({ caseId: fixture.id, step: index + 1, failure: error instanceof PipelineError ? error.code : "EVALUATION_CHECK_FAILED" });
        break;
      }
    }
  }
  const stageNames = ["transcriptionMs", "lunaMs", "processingBeforeCommitMs"] as const;
  return {
    mode: options.live ? "live" : "offline", generatedAt: new Date().toISOString(),
    promptRevision: options.live ? LUNA_PROMPT_REVISION : "offline-oracle-v1",
    models: { luna: config?.lunaModel ?? "offline-oracle", transcription: config?.transcriptionModel ?? "synthetic-text-bypass" },
    caseCount: allCases.length, assessmentErrors, failures,
    timings: Object.fromEntries([
      ...stageNames.map((stage) => [stage, timingSummary(traces.flatMap((t) => { const value = t.record.diagnostics.timings[stage]; return value === null ? [] : [value]; }))]),
      ["persistenceMs", timingSummary(traces.map((t) => t.persistenceMs))],
      ["totalMs", timingSummary(traces.map((t) => t.totalMs))],
    ]), outputs,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--live" && !arg.startsWith("--audio-manifest="))) throw new Error("Usage: eval:pipeline [--live] [--audio-manifest=/absolute/manifest.json]");
  const live = args.includes("--live");
  if (live) loadLocalEnv();
  const manifest = args.find((arg) => arg.startsWith("--audio-manifest="))?.slice("--audio-manifest=".length);
  const audioCases = manifest ? AudioCasesSchema.parse(JSON.parse(await readFile(manifest, "utf8"))) : undefined;
  const report = await evaluate({ live, audioCases });
  const results = path.join(webRoot, "evals/pipeline/results");
  await mkdir(results, { recursive: true });
  const destination = path.join(results, `${Date.now()}-${report.mode}.json`);
  await writeFile(destination, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: destination, mode: report.mode, caseCount: report.caseCount, assessmentErrors: report.assessmentErrors, failures: report.failures, timings: report.timings }, null, 2));
  if (report.failures || report.assessmentErrors) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error && error.message.startsWith("OPENAI_API_KEY") ? error.message : "Pipeline evaluation failed; check configuration and fixture paths."); process.exitCode = 1; });
}
