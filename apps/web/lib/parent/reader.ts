import "server-only";
import { getPipelineStore } from "../../server/storage";
import { sampleSession } from "./fixtures";
import type { ProgressReader } from "./reader-contract";

export type { ProgressReader };

// Fixture-backed reader for building the UI before a database exists.
const fixtureReader: ProgressReader = {
  async getSessionProgress(sessionId) {
    return sessionId === sampleSession.sessionId ? sampleSession : null;
  },
};

// PIPELINE_STORE=postgres reads the database; anything else uses the fixture.
// The sample session stays available as the on-stage fallback either way.
export function getProgressReader(): ProgressReader {
  if (process.env.PIPELINE_STORE !== "postgres") return fixtureReader;
  const store = getPipelineStore();
  return {
    async getSessionProgress(sessionId) {
      return (
        (await store.getSessionProgress!(sessionId)) ??
        (await fixtureReader.getSessionProgress(sessionId))
      );
    },
  };
}
