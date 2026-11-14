import { PipelineError } from "./errors";

export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const formats: Record<string, string[]> = {
  webm: ["audio/webm", "video/webm"],
  mp4: ["audio/mp4", "video/mp4"],
  m4a: ["audio/mp4", "audio/m4a", "audio/x-m4a"],
  wav: ["audio/wav", "audio/wave", "audio/x-wav"],
};

/** Metadata validation only; actual decoding belongs to the transcription adapter. */
export function validateAudio(audio: File): void {
  if (!(audio instanceof File) || audio.size === 0) throw new PipelineError("INVALID_REQUEST");
  if (audio.size > MAX_AUDIO_BYTES) throw new PipelineError("AUDIO_TOO_LARGE");
  const extension = audio.name.split(".").at(-1)?.toLowerCase() ?? "";
  const mime = audio.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!formats[extension]?.includes(mime)) throw new PipelineError("UNSUPPORTED_AUDIO");
}
