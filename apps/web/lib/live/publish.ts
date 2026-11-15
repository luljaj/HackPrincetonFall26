import "server-only";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";

// Convex carries only live updates for the parent's "right now" view; Postgres stays the record.
// Server-only: the publish mutation checks LIVE_PUBLISH_SECRET, which never reaches the browser.
export type LiveEvent = FunctionArgs<typeof api.live.publish>["event"];

let client: ConvexHttpClient | null = null;

/** Publish one live event. Returns false (and does nothing) when Convex isn't configured. */
export async function publishLive(event: LiveEvent): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = process.env.LIVE_PUBLISH_SECRET;
  if (!url || !secret) return false;
  client ??= new ConvexHttpClient(url);
  await client.mutation(api.live.publish, { secret, event });
  return true;
}
