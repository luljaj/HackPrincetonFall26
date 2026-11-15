import "server-only";
import { getPipelineStore } from "../storage";
import { createOpenAIAdapters } from "./client";
import { createPipelineRuntime, type PipelineRuntime } from "./runtime-core";
import { publishLive } from "../../lib/live/publish";

// Next can compile routes into separate bundles. Share the process-local store and
// diagnostics across bundles and HMR; never create a store per request.
const runtimeKey = Symbol.for("hackprinceton.pipeline.runtime.v1");
const shared = globalThis as typeof globalThis & { [runtimeKey]?: PipelineRuntime };
export function getPipelineRuntime(): PipelineRuntime {
  if (!shared[runtimeKey]) {
    const runtime = createPipelineRuntime(process.env, createOpenAIAdapters, getPipelineStore);
    // Realtime publisher, installed once (README): after a turn is saved, tell live dashboards to refetch.
    runtime.pipeline.publish = async (event) => { await publishLive({ kind: "session_updated", ...event }); };
    shared[runtimeKey] = runtime;
  }
  return shared[runtimeKey];
}
