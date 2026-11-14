import { PipelineError } from "../pipeline/errors";
import {
  CommitTurnInputSchema, SessionRecordSchema, SessionSnapshotSchema,
  type CommitTurnInput, type PipelineStore, type SessionRecord, type SessionSnapshot,
} from "./contract";

/** Development/test only: process-local state, lost on restart. */
export class MemoryPipelineStore implements PipelineStore {
  private readonly sessions = new Map<string, SessionSnapshot>();

  async createSession(input: SessionRecord): Promise<void> {
    const session = SessionRecordSchema.parse(input);
    if (this.sessions.has(session.sessionId)) throw new PipelineError("TURN_CONFLICT");
    this.sessions.set(session.sessionId, { ...session, interactions: [] });
  }

  async loadSession(sessionId: string): Promise<SessionSnapshot | null> {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async commitTurn(input: CommitTurnInput) {
    // No awaits between lookup, version check, validation, and replacement: atomic
    // within this process. A duplicate is scoped to its session and wins over version.
    const session = this.sessions.get(input.sessionId);
    if (!session) throw new PipelineError("SESSION_NOT_FOUND");
    const duplicate = session.interactions.find(
      (record) => record.interactionId === input.interaction.interactionId,
    );
    if (duplicate) return { record: structuredClone(duplicate), replayed: true };
    const { interaction, expectedTurnNumber } = CommitTurnInputSchema.parse(input);
    if (session.turnNumber !== expectedTurnNumber) throw new PipelineError("TURN_CONFLICT");
    const next = SessionSnapshotSchema.parse({
      ...session,
      turnNumber: interaction.turnNumber,
      activeQuestion: interaction.nextQuestion,
      assistanceProvided: session.assistanceProvided || interaction.assistanceInResponse,
      latestParentSummary: interaction.parentSummary ?? session.latestParentSummary,
      interactions: [...session.interactions, interaction],
    });
    this.sessions.set(input.sessionId, next);
    return { record: structuredClone(interaction), replayed: false };
  }
}
