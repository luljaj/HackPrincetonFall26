export type ProviderConfig = {
  apiKey: string;
  transcriptionModel: string;
  lunaModel: string;
};

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
