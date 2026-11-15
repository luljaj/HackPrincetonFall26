// Who controls the show's volume right now. One owner at a time, by rank: a pause outranks a dub, a dub
// outranks Dora's language greeting, and the greeting outranks the plain show. A higher owner takes over;
// a lower one can't. When an owner lets go, the show gets its sound back, unless someone else took over.
// Pure: the player applies the volume (app/lab/player.tsx, takeSound / releaseSound).

export type SoundOwner = "show" | "greeting" | "dub" | "pause";

const RANK: Record<SoundOwner, number> = { show: 0, greeting: 1, dub: 2, pause: 3 };

export const canTake = (current: SoundOwner, who: SoundOwner) => RANK[who] >= RANK[current];

/** Taking over from something louder than the greeting also stops the greeting's voice. */
export const silencesGreeting = (who: SoundOwner) => RANK[who] > RANK.greeting;

export const afterRelease = (current: SoundOwner, who: SoundOwner): SoundOwner => (current === who ? "show" : current);
