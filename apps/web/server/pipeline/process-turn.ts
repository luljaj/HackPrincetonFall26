import { UuidSchema, type QuestionContext } from "../../lib/contracts/scene";
import { TurnRequestMetadataSchema, TurnResponseSchema, type TurnResponse } from "../../lib/contracts/turn";
import { InteractionRecordSchema } from "../storage/contract";
import { LunaDraftSchema, type LunaDraft } from "./luna-contract";
import { validateAudio } from "./audio";
import { PipelineError, withStore } from "./errors";
import type { LunaContext, PipelineDependencies, ProcessTurnInput } from "./types";

const normalized = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
const publicQuestion = (question: QuestionContext | null) =>
  question && { questionId: question.questionId, text: question.text };

async function provider<T>(call: () => Promise<T>): Promise<T> {
  try { return await call(); }
  catch (error) {
    if (error instanceof PipelineError &&
      ["UNSUPPORTED_AUDIO", "PROVIDER_ERROR", "INVALID_MODEL_OUTPUT"].includes(error.code)) throw error;
    throw new PipelineError("PROVIDER_ERROR");
  }
}

function select(draft: LunaDraft, question: QuestionContext, original: boolean, createId: () => string) {
  const status = draft.assessment.answerStatus;
  let nextQuestion: QuestionContext | null;
  if (original && status === "incorrect") {
    if (!draft.nextQuestion || !draft.assistanceProvided ||
      normalized(draft.nextQuestion.text) === normalized(question.text)) {
      throw new PipelineError("INVALID_MODEL_OUTPUT");
    }
    nextQuestion = { questionId: createId(), ...draft.nextQuestion };
    if (!UuidSchema.safeParse(nextQuestion.questionId).success || nextQuestion.questionId === question.questionId) {
      throw new PipelineError("INVALID_MODEL_OUTPUT");
    }
  } else {
    if (draft.nextQuestion !== null) throw new PipelineError("INVALID_MODEL_OUTPUT");
    nextQuestion = status === "unclear" || status === "off_topic" ? question : null;
  }
  // The question belongs in one field of the draft, and is appended once here.
  if (normalized(draft.feedbackText).includes(normalized(question.text)) ||
    (nextQuestion && normalized(draft.feedbackText).includes(normalized(nextQuestion.text)))) {
    throw new PipelineError("INVALID_MODEL_OUTPUT");
  }
  return {
    nextQuestion,
    text: [draft.feedbackText, nextQuestion?.text].filter(Boolean).join(" "),
    type: status === "unclear" ? "clarification" as const : "teaching" as const,
  };
}

/** The same interaction ID always means the same submission; replay does not
 * compare metadata/audio. No uploaded bytes escape the transcription call. */
export async function processTurn(input: ProcessTurnInput, deps: PipelineDependencies): Promise<TurnResponse> {
  const started = deps.clock.monotonicMs();
  const sessionId = UuidSchema.safeParse(input.sessionId);
  const metadata = TurnRequestMetadataSchema.safeParse(input.metadata);
  if (!sessionId.success || !metadata.success) throw new PipelineError("INVALID_REQUEST");
  validateAudio(input.audio);
  const session = await withStore(() => deps.store.loadSession(sessionId.data));
  if (!session) throw new PipelineError("SESSION_NOT_FOUND");
  const replay = session.interactions.find((record) => record.interactionId === metadata.data.interactionId);
  if (replay) return TurnResponseSchema.parse(replay.turnResponse);
  const question = session.activeQuestion;
  if (!question || metadata.data.expectedTurnNumber !== session.turnNumber || metadata.data.questionId !== question.questionId) {
    throw new PipelineError("TURN_CONFLICT");
  }

  const transcriptionStarted = deps.clock.monotonicMs();
  const transcription = await provider(() => deps.transcribe({
    audio: input.audio, hints: [...session.sceneSnapshot.transcriptionHints],
  }));
  const transcriptionMs = deps.clock.monotonicMs() - transcriptionStarted;
  if (typeof transcription.transcript !== "string" || transcription.transcript.trim().length > 10000 ||
    typeof transcription.model !== "string" || !transcription.model.trim() || transcription.model.length > 128) {
    throw new PipelineError("PROVIDER_ERROR");
  }
  const transcript = transcription.transcript.trim();
  let draft: LunaDraft | null = null;
  let lunaModel: string | null = null;
  let lunaMs: number | null = null;
  let selection = {
    nextQuestion: question as QuestionContext | null,
    text: `I didn't catch that. ${question.text}`,
    type: "clarification" as "clarification" | "teaching",
  };
  if (transcript) {
    const context: LunaContext = {
      scene: session.sceneSnapshot, question,
      questionKind: question.questionId === session.sceneSnapshot.initialQuestion.questionId ? "original" : "variant",
      transcript, assistanceBeforeAnswer: session.assistanceProvided,
      history: session.interactions.map((record) => ({
        question: { questionId: record.questionId, text: record.questionText, answerGuide: record.answerGuide },
        transcript: record.transcript,
        response: { type: record.responseType, text: record.responseText },
        assessment: record.assessment, assistanceInResponse: record.assistanceInResponse,
      })),
    };
    const lunaStarted = deps.clock.monotonicMs();
    // An injected adapter cannot mutate the captured session state.
    const result = await provider(() => deps.luna(structuredClone(context)));
    lunaMs = deps.clock.monotonicMs() - lunaStarted;
    const parsed = LunaDraftSchema.safeParse(result.draft);
    if (!parsed.success || typeof result.model !== "string" || !result.model.trim() || result.model.length > 128) {
      throw new PipelineError("INVALID_MODEL_OUTPUT");
    }
    draft = parsed.data;
    lunaModel = result.model;
    selection = select(draft, question, context.questionKind === "original", deps.createId);
    if (selection.nextQuestion && session.interactions.some((record) =>
      record.questionId === selection.nextQuestion?.questionId && record.questionId !== question.questionId)) {
      throw new PipelineError("INVALID_MODEL_OUTPUT");
    }
  }
  const assessment = {
    ...(draft?.assessment ?? { answerStatus: "not_assessed" as const, evidence: null, possibleMisconception: null }),
    assistanceBeforeAnswer: session.assistanceProvided,
  };
  const turnResponse = TurnResponseSchema.safeParse({
    sessionId: session.sessionId, interactionId: metadata.data.interactionId,
    turnNumber: session.turnNumber + 1,
    response: { type: selection.type, text: selection.text, nextQuestion: publicQuestion(selection.nextQuestion) },
    assessment,
  });
  if (!turnResponse.success) throw new PipelineError("INVALID_MODEL_OUTPUT");
  const record = InteractionRecordSchema.parse({
    sessionId: session.sessionId, interactionId: metadata.data.interactionId,
    turnNumber: session.turnNumber + 1, sceneId: session.sceneSnapshot.sceneId,
    objectiveId: session.sceneSnapshot.objectiveId, completedAt: deps.clock.now(),
    questionId: question.questionId, questionText: question.text, answerGuide: question.answerGuide,
    transcript, responseType: selection.type, responseText: selection.text,
    nextQuestion: selection.nextQuestion, assessment,
    assistanceInResponse: draft?.assistanceProvided ?? false,
    parentSummary: draft?.parentSummary ?? null, turnResponse: turnResponse.data,
    diagnostics: {
      lunaDraft: draft, transcriptionModel: transcription.model, lunaModel,
      promptRevision: deps.promptRevision,
      timings: { transcriptionMs, lunaMs, processingBeforeCommitMs: deps.clock.monotonicMs() - started },
    },
  });
  const persistenceStarted = deps.clock.monotonicMs();
  const committed = await withStore(() => deps.store.commitTurn({
    sessionId: session.sessionId, expectedTurnNumber: session.turnNumber, interaction: record,
  }));
  const persistenceMs = deps.clock.monotonicMs() - persistenceStarted;
  const log = (event: "publisher_failed" | "trace_failed") => {
    try {
      if (deps.log) deps.log(event);
      else console.warn(event);
    } catch { /* Observability never changes a committed result. */ }
  };
  if (!committed.replayed && deps.publish) {
    try {
      await deps.publish({ sessionId: committed.record.sessionId, interactionId: committed.record.interactionId, turnNumber: committed.record.turnNumber });
    } catch { log("publisher_failed"); }
  }
  if (deps.trace) {
    const totalMs = deps.clock.monotonicMs() - started;
    try { await deps.trace({ record: structuredClone(committed.record), replayed: committed.replayed, persistenceMs, totalMs }); }
    catch { log("trace_failed"); }
  }
  return TurnResponseSchema.parse(committed.record.turnResponse);
}
