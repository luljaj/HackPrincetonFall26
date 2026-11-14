import "server-only";
import type { ProgressReader } from "../../lib/contracts";
import type { PipelineStore } from "./contract";
import { createDemoAdmin, type DemoAdmin } from "./admin";
import { getDb } from "./db";
import { MemoryPipelineStore } from "./memory";
import { createPostgresStore } from "./postgres";

export * from "./contract";

// A single selector is used by the HTTP pipeline and dashboard.
const memoryKey = Symbol.for("hackprinceton.pipeline.memory.v1");
const shared = globalThis as typeof globalThis & { [memoryKey]?: MemoryPipelineStore };
export function getPipelineStore(): PipelineStore & Partial<ProgressReader> {
  const kind = process.env.PIPELINE_STORE ?? "memory";
  if (kind === "postgres") return createPostgresStore(getDb());
  if (kind === "memory" && ["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    return shared[memoryKey] ??= new MemoryPipelineStore();
  }
  throw new Error(`PIPELINE_STORE=${kind} is unavailable in this environment`);
}

/** Dashboard-only maintenance (delete, demo reset). Null when no database is configured. */
export function getDemoAdmin(): DemoAdmin | null {
  return process.env.PIPELINE_STORE === "postgres" ? createDemoAdmin(getDb()) : null;
}
