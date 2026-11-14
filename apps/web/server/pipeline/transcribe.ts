import type { TranscriptionCreateParamsNonStreaming } from "openai/resources/audio/transcriptions";
import { PipelineError } from "./errors";
import type { TranscriptionAdapter } from "./types";

export type TranscriptionClient = {
  audio: { transcriptions: {
    create: (input: TranscriptionCreateParamsNonStreaming<"json">) => Promise<{ text: string }>;
  } };
};

// Inspect only status and structured provider fields; never expose provider details.
function isDecodeFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, code, param, message } = error as { status?: number; code?: string; param?: string; message?: string };
  return status === 415 || (status === 400 && (
    ["invalid_audio", "invalid_audio_format", "audio_decode_error", "unsupported_audio_format"].includes(code ?? "") ||
    param === "file" ||
    (typeof message === "string" && /invalid file format|unsupported (audio|file) format|could not decode|failed to decode|audio decoding/i.test(message))
  ));
}

export function createTranscriptionAdapter(client: TranscriptionClient, model: string): TranscriptionAdapter {
  return async ({ audio, hints }) => {
    try {
      const result = await client.audio.transcriptions.create({
        model, file: audio, response_format: "json",
        ...(hints.length ? { prompt: `Scene vocabulary (possible answers include wrong answers): ${hints.join(", ")}` } : {}),
      });
      if (typeof result.text !== "string") throw new PipelineError("PROVIDER_ERROR");
      return { transcript: result.text.trim(), model };
    } catch (error) {
      throw new PipelineError(isDecodeFailure(error) ? "UNSUPPORTED_AUDIO" : "PROVIDER_ERROR");
    }
  };
}
