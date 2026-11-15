import { TOPIC_LEVEL, type TopicLevel, type Video } from "../../../lib/parent/topics-data";

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export function SampleBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="rounded-2xl border-2 border-dashed border-warn bg-warn/10 px-5 py-3 text-sm">
      <p className="font-semibold">Sample data</p>
      <p className="text-foreground/80">{children}</p>
    </div>
  );
}

/** Three-step topic progress: Exploring → Practicing → Comfortable. */
export function LevelSteps({ level, color }: { level: TopicLevel; color: string }) {
  const { step, label } = TOPIC_LEVEL[level];
  return (
    <span className="inline-flex items-center gap-2" aria-label={`Topic progress: ${label}`}>
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-2 w-6 rounded-full"
            style={{ background: i <= step ? color : "color-mix(in srgb, currentColor 12%, transparent)" }}
          />
        ))}
      </span>
      <span className="text-sm font-semibold" style={{ color }}>
        {label}
      </span>
    </span>
  );
}

export function VideoTag({ video }: { video: Video }) {
  return (
    <span className="text-xs text-foreground/60">
      <span className="font-semibold" style={{ color: video.color }}>
        {video.show}
      </span>{" "}
      · {video.episode} · {video.moment}
    </span>
  );
}

export function StatPills({ items }: { items: [string, number][] }) {
  return (
    <p className="flex flex-wrap gap-2 text-sm">
      {items.map(([label, value]) => (
        <span key={label} className="rounded-full border border-line bg-card px-3 py-1">
          <b className="tabular-nums">{value}</b> <span className="text-foreground/60">{label}</span>
        </span>
      ))}
    </p>
  );
}
