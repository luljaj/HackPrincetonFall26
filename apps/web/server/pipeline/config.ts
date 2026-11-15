export type ProviderConfig = {
  apiKey: string;
  transcriptionModel: string;
  lunaModel: string;
};

/** OpenAI processing tier for every Luna call. "priority" is faster (~0.25-0.3 s per call, measured on
 * gpt-6-luna) and costs more per token; set LUNA_SERVICE_TIER=default to go back to standard pricing. */
export const lunaServiceTier = (env: Readonly<Record<string, string | undefined>> = process.env) =>
  (env.LUNA_SERVICE_TIER?.trim() || "priority") as "priority" | "default" | "flex" | "auto";

/** Called only when a provider is requested; never validate at module import. */
export function readProviderConfig(env: Readonly<Record<string, string | undefined>> = process.env): ProviderConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to use the model pipeline.");
  return {
    apiKey,
    transcriptionModel: env.TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe",
    lunaModel: env.LUNA_MODEL?.trim() || "gpt-6-luna",
  };
}
