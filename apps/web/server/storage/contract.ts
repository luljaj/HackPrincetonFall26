// Storage contract shared by Luka's pipeline and the dashboard owner's adapters.
// Source: model-pipeline-implementation-plan.md §9 and learning-progress-plan.md §4.
// Agree changes with both owners. When Luka creates `lib/contracts`, move the shared
// value types (QuestionContext, LearningAssessment, ...) there and import them here.

export type AnswerStatus =
  | "correct"
  | "incorrect"
  | "unclear"
  | "off_topic"
  | "not_assessed";

export type LearningAssessment = {
  answerStatus: AnswerStatus;
  evidence: string | null;
  possibleMisconception: string | null;
  assistanceBeforeAnswer: boolean;
};

/** A question with its private answer guide. The guide never reaches a browser. */
export type QuestionContext = {
  questionId: string;
  text: string;
  answerGuide: string;
};

export type SessionRecord = {
  sessionId: string;
  createdAt: string; // ISO timestamp
  sceneId: string;
  objectiveId: string;
  /** Scene snapshot taken at session creation (Luka's SceneConfig). Stored as JSON. */
  sceneSnapshot: unknown;
  activeQuestion: QuestionContext | null;
  turnNumber: number; // 0 at creation
  assistanceProvided: boolean;
  learnerId?: string | null;
  /** Seeded demo/fallback data. Shown with a "Sample data" badge. */
  isSample?: boolean;
};

export type InteractionDiagnostics = {
  lunaDraft: unknown | null; // null when Luna was skipped
  transcriptionModel: string | null;
  lunaModel: string | null;
  promptRevision: string | null;
  transcriptionMs: number | null;
  lunaMs: number | null;
  precommitMs: number | null;
};

export type InteractionRecord = {
  sessionId: string;
  interactionId: string;
  turnNumber: number; // must equal expectedTurnNumber + 1
  sceneId: string;
  objectiveId: string;
  completedAt: string; // ISO timestamp, processing completion
  question: QuestionContext; // the question actually answered, with its guide
  transcript: string; // never audio
  response: { type: "teaching" | "clarification"; text: string };
  /** The session's active question after this turn (with private guide), or null. */
  nextQuestion: QuestionContext | null;
  assessment: LearningAssessment;
  assistanceInResponse: boolean;
  parentSummary: string | null; // null when Luna was skipped
  /** Exact public TurnResponse returned to the controller, replayed on retries. */
  turnResponse: unknown;
  diagnostics: InteractionDiagnostics;
};

export type SessionSnapshot = SessionRecord & {
  interactions: InteractionRecord[]; // ordered by turn number
  latestParentSummary: string | null;
};

export interface PipelineStore {
  createSession(session: SessionRecord): Promise<void>;
  loadSession(sessionId: string): Promise<SessionSnapshot | null>;
  /**
   * Atomically append the interaction and update the session's active question,
   * assistance state, turn number and latest non-null parent summary.
   * A duplicate (same session + interaction ID) returns the original record with replayed: true.
   * Throws SessionNotFoundError or TurnConflictError otherwise.
   */
  commitTurn(input: {
    sessionId: string;
    expectedTurnNumber: number;
    interaction: InteractionRecord;
  }): Promise<{ record: InteractionRecord; replayed: boolean }>;
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

/** Maps to HTTP 409 TURN_CONFLICT. */
export class TurnConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnConflictError";
  }
}

/** Maps to HTTP 503 PERSISTENCE_ERROR. */
export class PersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PersistenceError";
  }
}
