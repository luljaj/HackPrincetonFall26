import type { ParentView } from "./types";

// Implemented by the fixture reader and the Postgres adapter.
// Luka's ProgressReader (lib/contracts/progress.ts) is the shared interface; this wraps it with
// the dashboard's display fields.
export interface ParentViewReader {
  getParentView(sessionId: string): Promise<ParentView | null>;
  /** Most recent sessions first, sample sessions included (they carry isSample). */
  listParentViews(limit: number): Promise<ParentView[]>;
}
