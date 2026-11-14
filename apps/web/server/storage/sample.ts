import type { DemoAdmin } from "./admin";
import type { PipelineStore } from "./contract";
import { SAMPLE_SESSION_ID, writeSampleSession } from "./sample-data";

/** Replaces the sample session with a fresh copy. Safe to run repeatedly. */
export async function reseedSample(store: PipelineStore, admin: DemoAdmin): Promise<void> {
  await admin.deleteSession(SAMPLE_SESSION_ID);
  await writeSampleSession(store);
}

/** Demo reset: remove every non-sample session, then restore the sample. */
export async function resetDemo(store: PipelineStore, admin: DemoAdmin): Promise<{ removed: number }> {
  const removed = await admin.deleteNonSampleSessions();
  await reseedSample(store, admin);
  return { removed };
}
