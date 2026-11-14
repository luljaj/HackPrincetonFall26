import { desc, eq } from "drizzle-orm";
import type { StoreDb } from "./postgres";
import { PersistenceError } from "./contract";
import { sessions } from "./schema";

// Dashboard-owned maintenance queries. Not part of PipelineStore: Luka's pipeline never calls these.
export type DemoAdmin = {
  /** Deletes one session and (by cascade) its interactions and diagnostics. Returns false if missing. */
  deleteSession(sessionId: string): Promise<boolean>;
  /** Deletes every non-sample session. Returns how many were removed. */
  deleteNonSampleSessions(): Promise<number>;
  /** The most recently created non-sample session, i.e. the one the live demo is running. */
  latestLiveSessionId(): Promise<string | null>;
};

export function createDemoAdmin(db: StoreDb): DemoAdmin {
  const wrap = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      throw new PersistenceError("Storage operation failed", { cause: e });
    }
  };
  return {
    deleteSession: (sessionId) =>
      wrap(async () => {
        const rows = await db
          .delete(sessions)
          .where(eq(sessions.sessionId, sessionId))
          .returning({ id: sessions.sessionId });
        return rows.length > 0;
      }),
    deleteNonSampleSessions: () =>
      wrap(async () => {
        const rows = await db
          .delete(sessions)
          .where(eq(sessions.isSample, false))
          .returning({ id: sessions.sessionId });
        return rows.length;
      }),
    latestLiveSessionId: () =>
      wrap(async () => {
        const [row] = await db
          .select({ id: sessions.sessionId })
          .from(sessions)
          .where(eq(sessions.isSample, false))
          .orderBy(desc(sessions.createdAt))
          .limit(1);
        return row?.id ?? null;
      }),
  };
}
