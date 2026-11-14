import type { SceneConfig, QuestionContext } from "../../lib/contracts/scene";
import type { LearningAssessment } from "../../lib/contracts/evidence";
import type { SessionUpdatedEvent } from "../../lib/contracts/realtime";
import type { TurnRequestMetadata } from "../../lib/contracts/turn";
import type { PipelineStore, InteractionRecord } from "../storage/contract";

export type ProcessTurnInput = {
  sessionId: string;
  metadata: TurnRequestMetadata;
  audio: File;
};

/** Everything here is structured data, including untrusted learner transcripts.
 * The provider adapter supplies trusted behavior instructions separately. */
export type LunaContext = {
  scene: SceneConfig;
  question: QuestionContext;
  questionKind: "original" | "variant";
  transcript: string;
  assistanceBeforeAnswer: boolean;
  history: Array<{
    question: QuestionContext;
    transcript: string;
    response: { type: "teaching" | "clarification"; text: string };
    assessment: LearningAssessment;
    assistanceInResponse: boolean;
  }>;
};

export type TranscriptionAdapter = (input: {
  audio: File;
  hints: string[];
}) => Promise<{ transcript: string; model: string }>;
// Runtime schema validation remains in the service even with a typed provider.
export type LunaAdapter = (context: LunaContext) => Promise<{ draft: unknown; model: string }>;
export type PipelineClock = { now: () => string; monotonicMs: () => number };
export type PipelineTrace = {
  record: InteractionRecord;
  replayed: boolean;
  persistenceMs: number;
  totalMs: number;
};
export type PipelineDependencies = {
  store: PipelineStore;
  transcribe: TranscriptionAdapter;
  luna: LunaAdapter;
  createId: () => string;
  clock: PipelineClock;
  promptRevision: string;
  publish?: (event: SessionUpdatedEvent) => Promise<void>;
  trace?: (trace: PipelineTrace) => void | Promise<void>;
  // Fixed diagnostic category only, never provider payloads, transcripts, or audio.
  log?: (event: "publisher_failed" | "trace_failed") => void;
};
