import type { SessionProgress } from "./types";

// learning-progress-plan.md §5. Implemented by the fixture reader and the Postgres adapter.
export interface ProgressReader {
  getSessionProgress(sessionId: string): Promise<SessionProgress | null>;
}
