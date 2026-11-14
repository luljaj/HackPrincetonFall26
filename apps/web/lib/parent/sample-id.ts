// The sample session's fixed ID. UUID-shaped because the shared contracts require UUID session
// and interaction IDs. Safe to import from client code.
export const SAMPLE_SESSION_ID = "00000000-0000-4000-8000-00000000a001";
export const SAMPLE_INTERACTION_IDS = [
  "00000000-0000-4000-8000-00000000a002",
  "00000000-0000-4000-8000-00000000a003",
] as const;
/** The pre-UUID sample ID. Reseeding removes any leftover row with it. */
export const LEGACY_SAMPLE_SESSION_ID = "sample-session";
