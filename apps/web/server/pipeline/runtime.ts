import "server-only";
import { getPipelineStore } from "../storage";
import { createOpenAIAdapters } from "./client";
import { createPipelineRuntime, type PipelineRuntime } from "./runtime-core";

// Next can compile routes into separate bundles. Share the process-local store and
// diagnostics across bundles and HMR; never create a store per request.
const runtimeKey = Symbol.for("hackprinceton.pipeline.runtime.v1");
const shared = globalThis as typeof globalThis & { [runtimeKey]?: PipelineRuntime };
export function getPipelineRuntime(): PipelineRuntime {
  return shared[runtimeKey] ??= createPipelineRuntime(process.env, createOpenAIAdapters, getPipelineStore);
}
