import "server-only";
import type { ProgressReader } from "../../lib/parent/reader-contract";
import type { PipelineStore } from "./contract";
import { getDb } from "./db";
import { createPostgresStore } from "./postgres";

export * from "./contract";

// PIPELINE_STORE selects the adapter (model-pipeline-implementation-plan.md §2).
// "memory" is Luka's development adapter: add its branch here when it lands.
export function getPipelineStore(): PipelineStore & ProgressReader {
  const kind = process.env.PIPELINE_STORE ?? "memory";
  if (kind === "postgres") return createPostgresStore(getDb());
  throw new Error(
    `PIPELINE_STORE=${kind} has no adapter yet. Use "postgres", or add the memory adapter in server/storage/index.ts.`,
  );
}
