import { eq } from "drizzle-orm";
import { DEFAULT_FOCUS, FocusSchema, type Focus, type ParentPreferences } from "../../lib/parent/preferences";
import { PersistenceError } from "./contract";
import type { StoreDb } from "./postgres";
import { parentPreferences } from "./schema";

export const DEFAULT_LEARNER_KEY = "default";

export type PreferencesStore = {
  get(learnerKey?: string): Promise<ParentPreferences>;
  set(focus: Focus, learnerKey?: string, now?: Date): Promise<ParentPreferences>;
};

export function createPreferencesStore(db: StoreDb): PreferencesStore {
  return {
    async get(learnerKey = DEFAULT_LEARNER_KEY) {
      try {
        const [row] = await db
          .select()
          .from(parentPreferences)
          .where(eq(parentPreferences.learnerKey, learnerKey));
        if (!row) return { focus: DEFAULT_FOCUS, updatedAt: null };
        const parsed = FocusSchema.safeParse(row.focus);
        return {
          focus: parsed.success ? parsed.data : DEFAULT_FOCUS,
          updatedAt: row.updatedAt.toISOString(),
        };
      } catch (e) {
        throw new PersistenceError("Could not read preferences", { cause: e });
      }
    },
    async set(focus, learnerKey = DEFAULT_LEARNER_KEY, now = new Date()) {
      const value = FocusSchema.parse(focus);
      try {
        await db
          .insert(parentPreferences)
          .values({ learnerKey, focus: value, updatedAt: now })
          .onConflictDoUpdate({
            target: parentPreferences.learnerKey,
            set: { focus: value, updatedAt: now },
          });
        return { focus: value, updatedAt: now.toISOString() };
      } catch (e) {
        throw new PersistenceError("Could not save preferences", { cause: e });
      }
    },
  };
}

/** Used when no database is configured (PIPELINE_STORE unset): lives until the server restarts. */
export function createMemoryPreferencesStore(): PreferencesStore {
  let current: ParentPreferences = { focus: DEFAULT_FOCUS, updatedAt: null };
  return {
    async get() {
      return current;
    },
    async set(focus, _key, now = new Date()) {
      current = { focus: FocusSchema.parse(focus), updatedAt: now.toISOString() };
      return current;
    },
  };
}
