import type { PipelineErrorResponse } from "../../lib/contracts/turn";

export type PipelineErrorCode = PipelineErrorResponse["error"]["code"];
// HTTP mapping from the model-pipeline specification, section 4.
const statuses: Record<PipelineErrorCode, number> = {
  INVALID_REQUEST: 400, UNSUPPORTED_AUDIO: 415, AUDIO_TOO_LARGE: 413,
  SESSION_NOT_FOUND: 404, TURN_CONFLICT: 409, PROVIDER_ERROR: 502,
  INVALID_MODEL_OUTPUT: 502, PERSISTENCE_ERROR: 503,
};
const messages: Record<PipelineErrorCode, string> = {
  INVALID_REQUEST: "The request is invalid.",
  UNSUPPORTED_AUDIO: "The audio format is unsupported or could not be decoded.",
  AUDIO_TOO_LARGE: "The audio exceeds the 3 MiB limit.",
  SESSION_NOT_FOUND: "The session was not found.",
  TURN_CONFLICT: "The session question or turn has changed.",
  PROVIDER_ERROR: "The model provider is unavailable.",
  INVALID_MODEL_OUTPUT: "The model returned an invalid teaching response.",
  PERSISTENCE_ERROR: "The session store is unavailable.",
};

/** Public-safe message only; never attach a raw provider/store error. */
export class PipelineError extends Error {
  readonly status: number;
  constructor(readonly code: PipelineErrorCode) {
    super(messages[code]);
    this.name = "PipelineError";
    this.status = statuses[code];
  }
}

export async function withStore<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof PipelineError &&
      ["TURN_CONFLICT", "SESSION_NOT_FOUND", "PERSISTENCE_ERROR"].includes(error.code)) throw error;
    throw new PipelineError("PERSISTENCE_ERROR");
  }
}
