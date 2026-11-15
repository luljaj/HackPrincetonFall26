import "server-only";
import type { ProgressReader } from "../../lib/contracts";
import type { PipelineStore } from "./contract";
import { createDemoAdmin, type DemoAdmin } from "./admin";
import { getDb } from "./db";
import {
  createMemoryPreferencesStore,
  createPreferencesStore,
  type PreferencesStore,
} from "./preferences";
import { MemoryPipelineStore } from "./memory";
import { createMemoryPlayStore, createPostgresPlayStore, type PlayStore } from "./play";
export { TRANSCRIPT_DAYS } from "./play";
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

/** Aggregate activity from the learning_events hypertable. Null when no database is configured. */
export function getInsightsDb() {
  return process.env.PIPELINE_STORE === "postgres" ? getDb() : null;
}

const prefsKey = Symbol.for("hackprinceton.parent.preferences.memory.v1");
const prefsShared = globalThis as typeof globalThis & { [prefsKey]?: PreferencesStore };

/** Parent learning-focus preferences: Postgres when configured, otherwise in memory. */
export function getPreferencesStore(): PreferencesStore {
  if (process.env.PIPELINE_STORE === "postgres") return createPreferencesStore(getDb());
  return (prefsShared[prefsKey] ??= createMemoryPreferencesStore());
}

const playKey = Symbol.for("hackprinceton.play.memory.v1");
const playShared = globalThis as typeof globalThis & { [playKey]?: PlayStore };

/** Play-mode session trace: Postgres when configured, otherwise in memory. */
export function getPlayStore(): PlayStore {
  if (process.env.PIPELINE_STORE === "postgres") return createPostgresPlayStore(getDb());
  return (playShared[playKey] ??= createMemoryPlayStore());
}
