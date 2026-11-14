// The TV lineup. A channel with no `src` shows a "coming soon" card.
// Media lives in public/media (git-ignored; converted locally from the DVD).
export type Channel = { id: string; name: string; color: string; src?: string };

export const CHANNELS: Channel[] = [
  { id: "dora", name: "Dora", color: "#ff5fa2", src: "/media/dora-ep1.mp4" },
  { id: "bluey", name: "Bluey", color: "#4fa3ff" },
  { id: "peppa", name: "Peppa", color: "#ff8a5c" },
  { id: "daniel", name: "Daniel Tiger", color: "#ffc93c" },
];
