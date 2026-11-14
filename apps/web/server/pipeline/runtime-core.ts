import { randomUUID } from "node:crypto";
import { MemoryPipelineStore } from "../storage/memory";
import type { PipelineStore } from "../storage/contract";
import { exampleScene } from "../scenes/example.scene";
import { PipelineError } from "./errors";
import { LUNA_PROMPT_REVISION } from "./luna";
import type { PipelineDependencies, PipelineTrace } from "./types";
import type { SessionDependencies } from "./session";

type Environment = Readonly<Record<string, string | undefined>>;
export const debugEnabled = (env: Environment) => env.NODE_ENV === "development" && env.PIPELINE_DEBUG === "true";

/** Pure development/test fallback. The server entry point injects the shared adapter. */
export function selectStore(env: Environment): PipelineStore {
  const adapter = env.PIPELINE_STORE ?? "memory";
  if (adapter !== "memory" || !["development", "test"].includes(env.NODE_ENV ?? "")) {
    throw new PipelineError("PERSISTENCE_ERROR");
  }
  return new MemoryPipelineStore();
}

export type PipelineRuntime = {
  session: SessionDependencies;
  pipeline: PipelineDependencies;
  traces: Map<string, PipelineTrace>;
  httpTimings: Map<string, number>;
};
export const traceKey = (sessionId: string, interactionId: string) => `${sessionId}:${interactionId}`;

export function createPipelineRuntime(env: Environment, providers: () => Pick<PipelineDependencies, "transcribe" | "luna">, storeSource: PipelineStore | (() => PipelineStore) = () => selectStore(env)): PipelineRuntime {
  let store: PipelineStore;
  try { store = typeof storeSource === "function" ? storeSource() : storeSource; }
  catch { throw new PipelineError("PERSISTENCE_ERROR"); }
  const clock = { now: () => new Date().toISOString(), monotonicMs: () => performance.now() };
  const traces = new Map<string, PipelineTrace>();
  let adapters: ReturnType<typeof providers> | undefined;
  const getAdapters = () => adapters ??= providers();
  return {
    session: { store, clock, createId: randomUUID, getScene: (id) => id === exampleScene.sceneId ? structuredClone(exampleScene) : null },
    pipeline: {
      store, clock, createId: randomUUID, promptRevision: LUNA_PROMPT_REVISION,
      transcribe: (input) => getAdapters().transcribe(input),
      luna: (input) => getAdapters().luna(input),
      ...(debugEnabled(env) ? { trace: (trace: PipelineTrace) => { traces.set(traceKey(trace.record.sessionId, trace.record.interactionId), trace); } } : {}),
    },
    traces, httpTimings: new Map(),
  };
}
