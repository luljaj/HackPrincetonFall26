// Who controls the show's volume right now. One owner at a time, by rank: a pause outranks a dub, and a dub
// outranks the plain show. A higher owner takes over; a lower one can't. When an owner lets go, the show gets
// its sound back, unless someone else took over. Pure: the player applies the volume (app/lab/player.tsx,
// takeSound / releaseSound).

export type SoundOwner = "show" | "dub" | "pause";

const RANK: Record<SoundOwner, number> = { show: 0, dub: 1, pause: 2 };

export const canTake = (current: SoundOwner, who: SoundOwner) => RANK[who] >= RANK[current];

export const afterRelease = (current: SoundOwner, who: SoundOwner): SoundOwner => (current === who ? "show" : current);
