import OpenAI from "openai";
import { readProviderConfig } from "../../../server/pipeline/config";
import { judgeTurn, JudgeRequestSchema, type JudgeClient } from "../../../server/judge/judge";

export const runtime = "nodejs";

let client: OpenAI | null = null; // reused so the TLS connection stays warm between turns

export async function POST(request: Request): Promise<Response> {
  const parsed = JudgeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid judge request." }, { status: 400 });
  let config;
  try {
    config = readProviderConfig();
  } catch {
    return Response.json({ error: "Set OPENAI_API_KEY in apps/web/.env.local to use Luna." }, { status: 503 });
  }
  client ??= new OpenAI({ apiKey: config.apiKey, timeout: 8_000, maxRetries: 0 });
  const started = performance.now();
  try {
    const result = await judgeTurn(client as unknown as JudgeClient, config.lunaModel, parsed.data);
    return Response.json({ ...result, ms: Math.round(performance.now() - started) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Luna couldn't judge that turn." }, { status: 502 });
  }
}
