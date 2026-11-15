// Display info for each prepared scene, keyed by sceneId. Pure presentation: the show name and
// colour on parent cards. Add a row when a new scene is authored.
// `art` is optional artwork under public/media (git-ignored, private demo only). No art, no image.
export type ShowInfo = { show: string; episode: string; color: string; art?: string };

const SHOWS: Record<string, ShowInfo> = {
  "demo-scene": { show: "Dora", episode: "Episode 3", color: "#ff5fa2", art: "/media/shows/dora.png" },
  "sample-scene": { show: "Dora", episode: "Sample episode", color: "#ff5fa2", art: "/media/shows/dora.png" },
};

const FALLBACK: ShowInfo = { show: "Episode", episode: "", color: "#6f675d" };

export function showFor(sceneId: string): ShowInfo {
  return SHOWS[sceneId] ?? FALLBACK;
}
