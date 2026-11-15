// Display info for each prepared scene, keyed by sceneId. Pure presentation: the show name and
// colour on parent cards. Add a row when a new scene is authored.
export type ShowInfo = { show: string; episode: string; color: string };

const SHOWS: Record<string, ShowInfo> = {
  "demo-scene": { show: "Dora", episode: "Episode 3", color: "#ff5fa2" },
  "dora-treasure-demo": { show: "Dora", episode: "Dora and the lost jewel", color: "#ff5fa2" },
  "dora-ep3": { show: "Dora", episode: "When I Grow Up", color: "#ff5fa2" },
  "sample-scene": { show: "Dora", episode: "Sample episode", color: "#ff5fa2" },
};

const FALLBACK: ShowInfo = { show: "Episode", episode: "", color: "#6f675d" };

export function showFor(sceneId: string): ShowInfo {
  return SHOWS[sceneId] ?? FALLBACK;
}
