import { CreateSessionRequestSchema, CreateSessionResponseSchema, type CreateSessionRequest, type CreateSessionResponse } from "../../lib/contracts/turn";
import { SceneConfigSchema, type SceneConfig } from "../../lib/contracts/scene";
import { SessionRecordSchema, type PipelineStore } from "../storage/contract";
import { PipelineError, withStore } from "./errors";
import type { PipelineClock } from "./types";

export type SessionDependencies = {
  store: PipelineStore;
  getScene: (sceneId: string) => SceneConfig | null;
  createId: () => string;
  clock: PipelineClock;
};

export async function createSession(input: CreateSessionRequest, dependencies: SessionDependencies): Promise<CreateSessionResponse> {
  const parsed = CreateSessionRequestSchema.safeParse(input);
  if (!parsed.success) throw new PipelineError("INVALID_REQUEST");
  const scene = dependencies.getScene(parsed.data.sceneId);
  if (!scene) throw new PipelineError("INVALID_REQUEST");
  const snapshot = SceneConfigSchema.parse(scene);
  const record = SessionRecordSchema.parse({
    sessionId: dependencies.createId(), createdAt: dependencies.clock.now(),
    sceneSnapshot: snapshot, turnNumber: 0, activeQuestion: snapshot.initialQuestion,
    assistanceProvided: snapshot.assistanceAlreadyProvided, latestParentSummary: null,
  });
  await withStore(() => dependencies.store.createSession(record));
  return CreateSessionResponseSchema.parse({
    sessionId: record.sessionId, turnNumber: 0,
    question: { questionId: record.activeQuestion.questionId, text: record.activeQuestion.text },
  });
}
