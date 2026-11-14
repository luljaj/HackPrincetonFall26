import { randomUUID } from "node:crypto";
import { createPipelineRuntime } from "../pipeline/runtime-core";
import { createSession } from "../pipeline/session";
import { processTurn } from "../pipeline/process-turn";
import { PipelineError, withStore } from "../pipeline/errors";
import { SessionSnapshotSchema } from "./contract";
import { exampleScene } from "../scenes/example.scene";
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
import { createDemoAdmin, type DemoAdmin } from "./admin";
import { resetDemo, reseedSample } from "./sample";
import { SAMPLE_SESSION_ID } from "./sample-data";
import { sampleView } from "../../lib/parent/fixtures";
import { SessionProgressSchema } from "../../lib/contracts";

// Runs the real migrations against an in-process Postgres (PGlite). No Docker, no network.

const q1 = { questionId: "q1", text: "How many apples?", answerGuide: "Three apples." };
const q2 = { questionId: "q2", text: "Count with me: how many?", answerGuide: "Three." };

function session(id = "s1"): SessionRecord {
  return {
    sessionId: id,
    createdAt: "2026-11-14T18:00:00.000Z",
    sceneSnapshot: { ...exampleScene, sceneId: "demo-scene", objectiveId: "counting", objective: "Count three objects", initialQuestion: q1 },
    latestParentSummary: null,
    activeQuestion: q1,
    turnNumber: 0,
    assistanceProvided: false,
  };
}

function turn(over: Partial<InteractionRecord> = {}): InteractionRecord {
  const record: Omit<InteractionRecord, "turnResponse"> = {
    sessionId: "s1",
    interactionId: "i1",
    turnNumber: 1,
    sceneId: "demo-scene",
    objectiveId: "counting",
    completedAt: "2026-11-14T18:00:05.000Z",
    questionId: q1.questionId, questionText: q1.text, answerGuide: q1.answerGuide,
    transcript: "five",
    responseType: "teaching", responseText: "Let's count together.",
    nextQuestion: q2,
    assessment: {
      answerStatus: "incorrect",
      evidence: "Said five.",
      possibleMisconception: "counted the basket",
      assistanceBeforeAnswer: false,
    },
    assistanceInResponse: true,
    parentSummary: "Answered incorrectly; assistance was given.",
    diagnostics: {
      lunaDraft: null,
      transcriptionModel: "gpt-transcribe",
      lunaModel: "gpt-6-luna",
      promptRevision: "r1",
      timings: { transcriptionMs: 400, lunaMs: 900, processingBeforeCommitMs: 1350 },
    },
    ...over,
  };
  return { ...record, turnResponse: {
    sessionId: record.sessionId, interactionId: record.interactionId, turnNumber: record.turnNumber,
    response: { type: record.responseType, text: record.responseText, nextQuestion: record.nextQuestion && { questionId: record.nextQuestion.questionId, text: record.nextQuestion.text } },
    assessment: record.assessment,
  } };
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
        diagnostics: { ...turn().diagnostics, lunaDraft: null, lunaModel: null, timings: { ...turn().diagnostics.timings, lunaMs: null } },
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
        questionId: q2.questionId, questionText: q2.text, answerGuide: q2.answerGuide,
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
    expect(p?.interactions.map((i) => i.questionId)).toEqual(["q1", "q2"]);
    expect(p?.activeQuestion).toBeNull(); // the variant was answered, so the moment is over
    expect(p?.episode).toEqual({
      turns: 2,
      responsesWithAssistance: 1,
      finalStatus: "correct",
      parentSummary: "Answered correctly after assistance.",
    });
  });

  it("shows the pending variant right after a wrong answer, without its guide", async () => {
    await store.createSession(session());
    await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    const p = await store.getSessionProgress("s1");
    expect(p?.interactions[0]?.assessment.answerStatus).toBe("incorrect");
    expect(p?.activeQuestion).toEqual({ questionId: q2.questionId, text: q2.text });
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
    expect((await store.getSessionProgress("s1"))?.activeQuestion).toEqual({
      questionId: q1.questionId,
      text: q1.text,
    });
    expect((await store.getSessionProgress("s1"))?.episode).toEqual({
      turns: 0,
      responsesWithAssistance: 0,
      finalStatus: null,
      parentSummary: null,
    });
  });
});

describe("Demo admin, sample seed and reset", () => {
  let admin: DemoAdmin;
  beforeEach(async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    store = createPostgresStore(db as unknown as StoreDb);
    admin = createDemoAdmin(db as unknown as StoreDb);
  });

  it("seeds the sample session and matches the parent fixture", async () => {
    await reseedSample(store, admin);
    await reseedSample(store, admin); // idempotent
    expect(await store.getParentView(SAMPLE_SESSION_ID)).toEqual(sampleView);
    // The sample must satisfy Luka's strict shared schema (UUID IDs, ordered turns, no extras).
    expect(SessionProgressSchema.parse(sampleView.progress)).toEqual(sampleView.progress);
  });

  it("finds the newest non-sample session as the live one", async () => {
    await reseedSample(store, admin);
    expect(await admin.latestLiveSessionId()).toBeNull();
    await store.createSession({ ...session("old"), createdAt: "2026-11-14T18:00:00.000Z" });
    await store.createSession({ ...session("new"), createdAt: "2026-11-14T19:00:00.000Z" });
    expect(await admin.latestLiveSessionId()).toBe("new");
  });

  it("deletes one session with its evidence", async () => {
    await store.createSession(session());
    await store.commitTurn({ sessionId: "s1", expectedTurnNumber: 0, interaction: turn() });
    expect(await admin.deleteSession("s1")).toBe(true);
    expect(await store.loadSession("s1")).toBeNull();
    expect(await admin.deleteSession("s1")).toBe(false);
  });

  it("reset removes live sessions and keeps a fresh sample", async () => {
    await reseedSample(store, admin);
    await store.createSession(session("a"));
    await store.createSession(session("b"));
    await store.commitTurn({ sessionId: "a", expectedTurnNumber: 0, interaction: turn({ sessionId: "a" }) });
    expect(await resetDemo(store, admin)).toEqual({ removed: 2 });
    expect(await store.loadSession("a")).toBeNull();
    expect(await admin.latestLiveSessionId()).toBeNull();
    expect(await store.getParentView(SAMPLE_SESSION_ID)).toEqual(sampleView);
  });
});


describe("Pipeline and durable dashboard integration", () => {
  it("commits canonical pipeline turns, reloads through a fresh adapter, and replays without providers", async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const durable = createPostgresStore(db as unknown as StoreDb);
    let calls = 0;
    const runtime = createPipelineRuntime({ NODE_ENV: "production", PIPELINE_STORE: "postgres" }, () => ({
      transcribe: async () => ({ transcript: "four", model: "fake-transcriber" }),
      luna: async () => {
        calls++;
        return { model: "fake-luna", draft: {
          feedbackText: "Let's count the green apples.",
          nextQuestion: { text: "How many green apples are on the plate?", answerGuide: "Two." },
          assistanceProvided: true,
          assessment: { answerStatus: "incorrect", evidence: "Said four.", possibleMisconception: null },
          parentSummary: "Answered incorrectly; another question is pending.",
        } };
      },
    }), durable);
    const created = await createSession({ sceneId: exampleScene.sceneId }, runtime.session);
    const input = {
      sessionId: created.sessionId,
      metadata: { interactionId: randomUUID(), expectedTurnNumber: 0, questionId: created.question.questionId },
      audio: new File(["synthetic"], "answer.webm", { type: "audio/webm" }),
    };
    const response = await processTurn(input, runtime.pipeline);
    const reloaded = createPostgresStore(db as unknown as StoreDb);
    const snapshot = SessionSnapshotSchema.parse(await reloaded.loadSession(created.sessionId));
    expect(snapshot.activeQuestion?.questionId).toBe(response.response.nextQuestion?.questionId);
    expect(snapshot.interactions[0]?.turnResponse).toEqual(response);
    const parent = await reloaded.getSessionProgress(created.sessionId);
    expect(parent?.interactions[0]?.assessment.answerStatus).toBe("incorrect");
    expect(parent?.episode.parentSummary).toBe(snapshot.latestParentSummary);
    expect(JSON.stringify(parent)).not.toContain("answerGuide");
    // Real pipeline output must pass the shared parent schema and show the pending variant.
    expect(SessionProgressSchema.parse(parent)).toEqual(parent);
    expect(parent?.activeQuestion).toEqual(response.response.nextQuestion);
    expect(await processTurn(input, { ...runtime.pipeline, store: reloaded })).toEqual(response);
    expect(calls).toBe(1);
  });

  it("maps durable adapter errors to the public pipeline errors", async () => {
    for (const [error, code] of [
      [new SessionNotFoundError("missing"), "SESSION_NOT_FOUND"],
      [new TurnConflictError("stale"), "TURN_CONFLICT"],
      [new Error("private database detail"), "PERSISTENCE_ERROR"],
    ] as const) {
      try {
        await withStore(async () => { throw error; });
        expect.fail("expected a public pipeline error");
      } catch (mapped) {
        expect(mapped).toBeInstanceOf(PipelineError);
        expect((mapped as PipelineError).code).toBe(code);
      }
    }
  });
});
