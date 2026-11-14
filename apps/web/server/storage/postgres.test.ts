import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SessionNotFoundError,
  TurnConflictError,
  type InteractionRecord,
  type PipelineStore,
  type SessionRecord,
} from "./contract";
import { createPostgresStore, type StoreDb } from "./postgres";
import * as schema from "./schema";

// Runs the real migrations against an in-process Postgres (PGlite). No Docker, no network.

const q1 = { questionId: "q1", text: "How many apples?", answerGuide: "Three apples." };
const q2 = { questionId: "q2", text: "Count with me: how many?", answerGuide: "Three." };

function session(id = "s1"): SessionRecord {
  return {
    sessionId: id,
    createdAt: "2026-11-14T18:00:00.000Z",
    sceneId: "demo-scene",
    objectiveId: "counting",
    sceneSnapshot: { objective: "Count three objects" },
    activeQuestion: q1,
    turnNumber: 0,
    assistanceProvided: false,
  };
}

function turn(over: Partial<InteractionRecord> = {}): InteractionRecord {
  return {
    sessionId: "s1",
    interactionId: "i1",
    turnNumber: 1,
    sceneId: "demo-scene",
    objectiveId: "counting",
    completedAt: "2026-11-14T18:00:05.000Z",
    question: q1,
    transcript: "five",
    response: { type: "teaching", text: "Let's count together." },
    nextQuestion: q2,
    assessment: {
      answerStatus: "incorrect",
      evidence: "Said five.",
      possibleMisconception: "counted the basket",
      assistanceBeforeAnswer: false,
    },
    assistanceInResponse: true,
    parentSummary: "Answered incorrectly; assistance was given.",
    turnResponse: { response: { type: "teaching", text: "Let's count together." } },
    diagnostics: {
      lunaDraft: { feedbackText: "draft" },
      transcriptionModel: "gpt-transcribe",
      lunaModel: "gpt-6-luna",
      promptRevision: "r1",
      transcriptionMs: 400,
      lunaMs: 900,
      precommitMs: 1350,
    },
    ...over,
  };
}

let store: ReturnType<typeof createPostgresStore>;

beforeEach(async () => {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  store = createPostgresStore(db as unknown as StoreDb);
});

describe("PipelineStore (Postgres)", () => {
  it("creates and loads a session", async () => {
    await store.createSession(session());
    const snap = await store.loadSession("s1");
    expect(snap).toMatchObject({ turnNumber: 0, activeQuestion: q1, latestParentSummary: null });
    expect(snap?.interactions).toEqual([]);
    expect(await store.loadSession("missing")).toBeNull();
  });

  it("commits a turn and updates session state atomically", async () => {
    await store.createSession(session());
    const res = await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    expect(res.replayed).toBe(false);
    const snap = await store.loadSession("s1");
    expect(snap?.turnNumber).toBe(1);
    expect(snap?.activeQuestion).toEqual(q2);
    expect(snap?.assistanceProvided).toBe(true);
    expect(snap?.latestParentSummary).toBe("Answered incorrectly; assistance was given.");
    expect(snap?.interactions).toEqual([turn()]);
  });

  it("replays a duplicate interaction without writing again", async () => {
    await store.createSession(session());
    await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    // A retry carries the same interaction ID and the stale expected turn number.
    const retry = await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    expect(retry.replayed).toBe(true);
    expect(retry.record).toEqual(turn());
    expect((await store.loadSession("s1"))?.turnNumber).toBe(1);
  });

  it("rejects a different, stale turn", async () => {
    await store.createSession(session());
    await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    await expect(
      store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn({ interactionId: "i2" }) }),
    ).rejects.toBeInstanceOf(TurnConflictError);
  });

  it("never replays a record from another session", async () => {
    await store.createSession(session("s1"));
    await store.createSession(session("s2"));
    await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    const other = await store.commitTurn({
      sessionId: "s2",
      expectedTurnNumber: 0,
      interaction: turn({ sessionId: "s2" }),
    });
    expect(other.replayed).toBe(false);
    expect((await store.loadSession("s2"))?.turnNumber).toBe(1);
  });

  it("keeps the latest non-null parent summary when a turn has none", async () => {
    await store.createSession(session());
    await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    await store.commitTurn({
      sessionId: "s1",
      expectedTurnNumber: 1,
      interaction: turn({
        interactionId: "i2",
        turnNumber: 2,
        transcript: "",
        parentSummary: null,
        assessment: { answerStatus: "not_assessed", evidence: null, possibleMisconception: null, assistanceBeforeAnswer: true },
        assistanceInResponse: false,
        diagnostics: { ...turn().diagnostics, lunaDraft: null, lunaModel: null, lunaMs: null },
      }),
    });
    const snap = await store.loadSession("s1");
    expect(snap?.latestParentSummary).toBe("Answered incorrectly; assistance was given.");
    expect(snap?.assistanceProvided).toBe(true); // stays true once help was given
  });

  it("reports a missing session", async () => {
    await expect(
      store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("rejects a turn number that skips ahead", async () => {
    await store.createSession(session());
    await expect(
      store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn({ turnNumber: 3 }) }),
    ).rejects.toBeInstanceOf(TurnConflictError);
  });
});

describe("ProgressReader (Postgres)", () => {
  async function seeded(s: PipelineStore) {
    await s.createSession(session());
    await s.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    await s.commitTurn({
      sessionId: "s1",
      expectedTurnNumber: 1,
      interaction: turn({
        interactionId: "i2",
        turnNumber: 2,
        question: q2,
        transcript: "three",
        nextQuestion: null,
        assessment: { answerStatus: "correct", evidence: "Said three.", possibleMisconception: null, assistanceBeforeAnswer: true },
        assistanceInResponse: false,
        parentSummary: "Answered correctly after assistance.",
      }),
    });
  }

  it("returns parent-safe progress in turn order", async () => {
    await seeded(store);
    const p = await store.getSessionProgress("s1");
    expect(p?.objective).toBe("Count three objects");
    expect(p?.interactions.map((i) => i.transcript)).toEqual(["five", "three"]);
    expect(p?.episode).toEqual({
      turns: 2,
      responsesWithAssistance: 1,
      finalStatus: "correct",
      parentSummary: "Answered correctly after assistance.",
    });
  });

  it("never exposes answer guides, drafts or diagnostics", async () => {
    await seeded(store);
    const json = JSON.stringify(await store.getSessionProgress("s1"));
    for (const secret of ["answerGuide", "Three apples.", "draft", "gpt-6-luna", "turnResponse"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("returns null for an unknown session and empty progress for a new one", async () => {
    expect(await store.getSessionProgress("missing")).toBeNull();
    await store.createSession(session());
    expect((await store.getSessionProgress("s1"))?.episode).toEqual({
      turns: 0,
      responsesWithAssistance: 0,
      finalStatus: null,
      parentSummary: null,
    });
  });
});
