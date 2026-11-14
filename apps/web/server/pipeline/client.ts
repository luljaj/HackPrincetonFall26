import "server-only";
import OpenAI from "openai";
import { readProviderConfig } from "./config";
import { createLunaAdapter } from "./luna";
import { createTranscriptionAdapter } from "./transcribe";

/** Guarded Next.js entry. Pure factories remain usable by offline tests and CLI. */
export function createOpenAIAdapters() {
  const config = readProviderConfig();
  const client = new OpenAI({ apiKey: config.apiKey, timeout: 30_000, maxRetries: 0 });
  return {
    luna: createLunaAdapter(client, config.lunaModel),
    transcribe: createTranscriptionAdapter(client, config.transcriptionModel),
  };
}
