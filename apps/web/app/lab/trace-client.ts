// Browser side of the session trace: queue events, send in batches, flush when the tab hides.
// Best effort: the show never waits on it. Failed batches go back in the queue for the next try.
import type { PlayEvent } from "../../lib/play/trace";

type Fields = Omit<PlayEvent, "seq" | "at">;
const FLUSH_MS = 2000;
const MAX_QUEUE = 1000; // ponytail: drops the oldest past this if the server is down for a long time

export function createTrace(sessionId: string, episodeId: string, endFields: () => Fields) {
  let seq = 0;
  let queue: PlayEvent[] = [];
  let sending = false;

  const body = (events: PlayEvent[]) => JSON.stringify({ sessionId, episodeId, events });

  async function flush() {
    if (sending || queue.length === 0) return;
    sending = true;
    const batch = queue.slice(0, 200);
    try {
      const res = await fetch("/api/play/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(batch) });
      if (res.ok || res.status === 400) queue = queue.slice(batch.length); // 400 would never succeed: drop it
    } catch {
      // offline: keep the queue
    } finally {
      sending = false;
    }
  }

  const timer = setInterval(() => void flush(), FLUSH_MS);
  // Hidden tab = maybe closed: record an end (a later one wins if the kid comes back), then beacon.
  const onHide = () => {
    if (document.visibilityState !== "hidden") return;
    record(endFields());
    if (navigator.sendBeacon("/api/play/events", body(queue.slice(0, 200)))) queue = queue.slice(200);
  };
  document.addEventListener("visibilitychange", onHide);

  function record(fields: Fields) {
    queue.push({ ...fields, seq: seq++, at: Date.now() });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  }

  return {
    sessionId,
    record,
    stop() {
      record(endFields());
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    },
  };
}
