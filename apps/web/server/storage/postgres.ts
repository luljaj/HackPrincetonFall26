import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ProgressReader, SessionProgress } from "../../lib/contracts";
import type { ParentViewReader } from "../../lib/parent/reader-contract";
import type { ParentView } from "../../lib/parent/types";
import {
  PersistenceError,
  SessionNotFoundError,
  TurnConflictError,
  type AnswerStatus,
  type InteractionRecord,
  type PipelineStore,
  type QuestionContext,
  type SessionRecord,
  type SessionSnapshot,
} from "./contract";
import * as schema from "./schema";
import { interactionDiagnostics, interactions, learningEvents, sessions } from "./schema";

// Works with any Drizzle Postgres driver: postgres-js in the app, PGlite in tests.
export type StoreDb = PgDatabase<PgQueryResultHKT, typeof schema>;

type InteractionRow = typeof interactions.$inferSelect;
type DiagnosticsRow = typeof interactionDiagnostics.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

export function createPostgresStore(
  db: StoreDb,
): PipelineStore & ProgressReader & ParentViewReader {
  return {
    async createSession(session) {
      await guard(() =>
        db.transaction(async (tx) => {
          await tx.insert(sessions).values({
            sessionId: session.sessionId,
            learnerId: session.learnerId ?? null,
            sceneId: session.sceneSnapshot.sceneId,
            objectiveId: session.sceneSnapshot.objectiveId,
            sceneSnapshot: session.sceneSnapshot,
            turnNumber: session.turnNumber,
            activeQuestion: session.activeQuestion,
            assistanceProvided: session.assistanceProvided,
            latestParentSummary: null,
            isSample: session.isSample ?? false,
            createdAt: new Date(session.createdAt),
          });
          // Same transaction: the event log never disagrees with the sessions table.
          await tx.insert(learningEvents).values({
            eventTime: new Date(session.createdAt),
            sessionId: session.sessionId,
            eventType: "session_started",
            objectiveId: session.sceneSnapshot.objectiveId,
            isSample: session.isSample ?? false,
          });
        }),
      );
    },

    async loadSession(sessionId) {
      return guard(async () => {
        const [row] = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId));
        if (!row) return null;
        const rows = await db
          .select()
          .from(interactions)
          .leftJoin(
            interactionDiagnostics,
            and(
              eq(interactionDiagnostics.sessionId, interactions.sessionId),
              eq(interactionDiagnostics.interactionId, interactions.interactionId),
            ),
          )
          .where(eq(interactions.sessionId, sessionId))
          .orderBy(asc(interactions.turnNumber));
        return toSnapshot(
          row,
          rows.map((r) => toInteraction(r.interactions, r.interaction_diagnostics)),
        );
      });
    },

    async commitTurn({ sessionId, expectedTurnNumber, interaction }) {
      if (interaction.sessionId !== sessionId) {
        throw new TurnConflictError("Interaction belongs to a different session");
      }
      if (interaction.turnNumber !== expectedTurnNumber + 1) {
        throw new TurnConflictError(
          `Turn number ${interaction.turnNumber} must be expectedTurnNumber + 1 (${expectedTurnNumber + 1})`,
        );
      }

      return guard(() =>
        db.transaction(async (tx) => {
          const findDuplicate = async () => {
            const [dup] = await tx
              .select()
              .from(interactions)
              .leftJoin(
                interactionDiagnostics,
                and(
                  eq(interactionDiagnostics.sessionId, interactions.sessionId),
                  eq(interactionDiagnostics.interactionId, interactions.interactionId),
                ),
              )
              .where(
                and(
                  eq(interactions.sessionId, sessionId),
                  eq(interactions.interactionId, interaction.interactionId),
                ),
              );
            return dup ? toInteraction(dup.interactions, dup.interaction_diagnostics) : null;
          };

          // 1. Duplicate check comes before the stale-turn check (pipeline plan §9).
          const existing = await findDuplicate();
          if (existing) return { record: existing, replayed: true };

          // 2. Expected-version update. Locks the session row until commit.
          const [current] = await tx
            .select({
              summary: sessions.latestParentSummary,
              assisted: sessions.assistanceProvided,
              isSample: sessions.isSample,
            })
            .from(sessions)
            .where(eq(sessions.sessionId, sessionId));
          if (!current) throw new SessionNotFoundError(sessionId);

          const updated = await tx
            .update(sessions)
            .set({
              turnNumber: interaction.turnNumber,
              activeQuestion: interaction.nextQuestion,
              assistanceProvided: current.assisted || interaction.assistanceInResponse,
              latestParentSummary: interaction.parentSummary ?? current.summary,
            })
            .where(
              and(eq(sessions.sessionId, sessionId), eq(sessions.turnNumber, expectedTurnNumber)),
            )
            .returning({ sessionId: sessions.sessionId });

          if (updated.length === 0) {
            // A concurrent retry of this same interaction may have just committed.
            const raced = await findDuplicate();
            if (raced) return { record: raced, replayed: true };
            throw new TurnConflictError(
              `Stale turn: expected ${expectedTurnNumber} for session ${sessionId}`,
            );
          }

          // 3. Append evidence and diagnostics.
          await tx.insert(interactions).values(toInteractionRow(interaction));
          await tx.insert(learningEvents).values({
            eventTime: new Date(interaction.completedAt),
            sessionId,
            eventType: "answer_committed",
            interactionId: interaction.interactionId,
            turnNumber: interaction.turnNumber,
            objectiveId: interaction.objectiveId,
            answerStatus: interaction.assessment.answerStatus,
            assistanceInResponse: interaction.assistanceInResponse,
            isSample: current.isSample,
          });
          await tx.insert(interactionDiagnostics).values({
            sessionId,
            interactionId: interaction.interactionId,
            lunaDraft: interaction.diagnostics.lunaDraft,
            transcriptionModel: interaction.diagnostics.transcriptionModel,
            lunaModel: interaction.diagnostics.lunaModel,
            promptRevision: interaction.diagnostics.promptRevision,
            transcriptionMs: rounded(interaction.diagnostics.timings.transcriptionMs),
            lunaMs: rounded(interaction.diagnostics.timings.lunaMs),
            precommitMs: rounded(interaction.diagnostics.timings.processingBeforeCommitMs),
          });
          return { record: interaction, replayed: false };
        }),
      );
    },

    // Shared progress payload (Luka's SessionProgressSchema).
    async getSessionProgress(sessionId): Promise<SessionProgress | null> {
      return (await readParentView(db, sessionId))?.progress ?? null;
    },

    getParentView: (sessionId) => readParentView(db, sessionId),
  };
}

// Parent-safe read (learning-progress-plan.md §5). Selects only public columns, so answer
// guides and diagnostics never enter the result.
async function readParentView(db: StoreDb, sessionId: string): Promise<ParentView | null> {
  return guard(async () => {
    const [row] = await db
      .select({
        sessionId: sessions.sessionId,
        objectiveId: sessions.objectiveId,
        sceneSnapshot: sessions.sceneSnapshot,
        activeQuestion: sessions.activeQuestion,
        latestParentSummary: sessions.latestParentSummary,
        isSample: sessions.isSample,
      })
      .from(sessions)
      .where(eq(sessions.sessionId, sessionId));
    if (!row) return null;
    const rows = await db
      .select({
        interactionId: interactions.interactionId,
        turnNumber: interactions.turnNumber,
        questionId: interactions.questionId,
        questionText: interactions.questionText,
        transcript: interactions.transcript,
        responseText: interactions.responseText,
        responseType: interactions.responseType,
        answerStatus: interactions.answerStatus,
        evidence: interactions.evidence,
        possibleMisconception: interactions.possibleMisconception,
        assistanceBefore: interactions.assistanceBefore,
        assistanceInResponse: interactions.assistanceInResponse,
      })
      .from(interactions)
      .where(eq(interactions.sessionId, sessionId))
      .orderBy(asc(interactions.turnNumber));

    const items = rows.map((r) => ({
      interactionId: r.interactionId,
      turnNumber: r.turnNumber,
      questionId: r.questionId,
      questionText: r.questionText,
      transcript: r.transcript,
      responseText: r.responseText,
      responseType: r.responseType as "teaching" | "clarification",
      assessment: {
        answerStatus: r.answerStatus as AnswerStatus,
        evidence: r.evidence,
        possibleMisconception: r.possibleMisconception,
        assistanceBeforeAnswer: r.assistanceBefore,
      },
      assistanceInResponse: r.assistanceInResponse,
    }));
    const last = items.at(-1);
    const active = row.activeQuestion as QuestionContext | null;
    return {
      objectiveId: row.objectiveId,
      isSample: row.isSample,
      progress: {
        sessionId: row.sessionId,
        objective: objectiveText(row.sceneSnapshot, row.objectiveId),
        // Project to the public shape: never include the private answer guide.
        activeQuestion: active && { questionId: active.questionId, text: active.text },
        interactions: items,
        episode: {
          turns: items.length,
          responsesWithAssistance: items.filter((i) => i.assistanceInResponse).length,
          finalStatus: last ? last.assessment.answerStatus : null,
          parentSummary: row.latestParentSummary,
        },
      },
    };
  });
}

function objectiveText(sceneSnapshot: unknown, fallback: string): string {
  const snap = sceneSnapshot as { objective?: unknown } | null;
  return typeof snap?.objective === "string" ? snap.objective : fallback;
}

function toSnapshot(row: SessionRow, list: InteractionRecord[]): SessionSnapshot {
  return {
    sessionId: row.sessionId,
    createdAt: row.createdAt.toISOString(),
    sceneSnapshot: row.sceneSnapshot as SessionRecord["sceneSnapshot"],
    activeQuestion: row.activeQuestion as QuestionContext | null,
    turnNumber: row.turnNumber,
    assistanceProvided: row.assistanceProvided,
    learnerId: row.learnerId,
    isSample: row.isSample,
    interactions: list,
    latestParentSummary: row.latestParentSummary,
  };
}

function toInteractionRow(i: InteractionRecord): typeof interactions.$inferInsert {
  return {
    sessionId: i.sessionId,
    interactionId: i.interactionId,
    turnNumber: i.turnNumber,
    sceneId: i.sceneId,
    objectiveId: i.objectiveId,
    questionId: i.questionId,
    questionText: i.questionText,
    answerGuide: i.answerGuide,
    transcript: i.transcript,
    responseType: i.responseType,
    responseText: i.responseText,
    nextQuestion: i.nextQuestion,
    answerStatus: i.assessment.answerStatus,
    evidence: i.assessment.evidence,
    possibleMisconception: i.assessment.possibleMisconception,
    assistanceBefore: i.assessment.assistanceBeforeAnswer,
    assistanceInResponse: i.assistanceInResponse,
    parentSummary: i.parentSummary,
    turnResponse: i.turnResponse,
    completedAt: new Date(i.completedAt),
  };
}

function toInteraction(r: InteractionRow, d: DiagnosticsRow | null): InteractionRecord {
  return {
    sessionId: r.sessionId,
    interactionId: r.interactionId,
    turnNumber: r.turnNumber,
    sceneId: r.sceneId,
    objectiveId: r.objectiveId,
    completedAt: r.completedAt.toISOString(),
    questionId: r.questionId, questionText: r.questionText, answerGuide: r.answerGuide,
    transcript: r.transcript,
    responseType: r.responseType as "teaching" | "clarification", responseText: r.responseText,
    nextQuestion: r.nextQuestion as QuestionContext | null,
    assessment: {
      answerStatus: r.answerStatus as AnswerStatus,
      evidence: r.evidence,
      possibleMisconception: r.possibleMisconception,
      assistanceBeforeAnswer: r.assistanceBefore,
    },
    assistanceInResponse: r.assistanceInResponse,
    parentSummary: r.parentSummary,
    turnResponse: r.turnResponse as InteractionRecord["turnResponse"],
    diagnostics: {
      lunaDraft: (d?.lunaDraft ?? null) as InteractionRecord["diagnostics"]["lunaDraft"],
      transcriptionModel: d?.transcriptionModel ?? "unknown",
      lunaModel: d?.lunaModel ?? null,
      promptRevision: d?.promptRevision ?? "unknown",
      timings: {
        transcriptionMs: d?.transcriptionMs ?? null,
        lunaMs: d?.lunaMs ?? null,
        processingBeforeCommitMs: d?.precommitMs ?? 0,
      },
    },
  };
}

function pgCode(e: unknown): string | undefined {
  const err = e as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = err?.code ?? err?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

// Contract errors pass through; unique violations become turn conflicts; anything else is a 503.
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SessionNotFoundError || e instanceof TurnConflictError) throw e;
    if (pgCode(e) === "23505") throw new TurnConflictError("Duplicate session or turn");
    throw new PersistenceError("Storage operation failed", { cause: e });
  }
}

// The existing SQL timing columns are integers; pipeline clocks use fractional milliseconds.
function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}
