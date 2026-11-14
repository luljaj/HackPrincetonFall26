import "server-only";
import { SessionProgressSchema } from "../contracts";
import { getDb } from "../../server/storage/db";
import { createPostgresStore } from "../../server/storage/postgres";
import { sampleView } from "./fixtures";
import type { ParentViewReader } from "./reader-contract";
import type { ParentView } from "./types";

export type { ParentViewReader };

// Fixture-backed reader for building the UI before a database exists.
const fixtureReader: ParentViewReader = {
  async getParentView(sessionId) {
    return sessionId === sampleView.progress.sessionId ? sampleView : null;
  },
  async listParentViews() {
    return [sampleView];
  },
};

// PIPELINE_STORE=postgres reads the database; anything else uses the fixture.
// The sample session stays available as the on-stage fallback either way.
function baseReader(): ParentViewReader {
  if (process.env.PIPELINE_STORE !== "postgres") return fixtureReader;
  const store = createPostgresStore(getDb());
  return {
    async getParentView(sessionId) {
      return (await store.getParentView(sessionId)) ?? (await fixtureReader.getParentView(sessionId));
    },
    async listParentViews(limit) {
      const views = await store.listParentViews(limit);
      return views.length > 0 ? views : fixtureReader.listParentViews(limit);
    },
  };
}

/**
 * Every parent read goes through Luka's strict SessionProgressSchema before it leaves the
 * server, so an extra field (an answer guide, a draft) fails loudly instead of leaking.
 */
function checked(view: ParentView): ParentView {
  return { ...view, progress: SessionProgressSchema.parse(view.progress) };
}

export function getParentViewReader(): ParentViewReader {
  const reader = baseReader();
  return {
    async getParentView(sessionId): Promise<ParentView | null> {
      const view = await reader.getParentView(sessionId);
      return view && checked(view);
    },
    async listParentViews(limit) {
      return (await reader.listParentViews(limit)).map(checked);
    },
  };
}
