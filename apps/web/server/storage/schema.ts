import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// learning-progress-plan.md §4. No audio column anywhere, ever.

export const learners = pgTable("learners", {
  learnerId: text("learner_id").primaryKey(),
  displayLabel: text("display_label").notNull(), // pseudonymous only, e.g. "Learner A"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  sessionId: text("session_id").primaryKey(),
  learnerId: text("learner_id").references(() => learners.learnerId, { onDelete: "set null" }),
  sceneId: text("scene_id").notNull(),
  objectiveId: text("objective_id").notNull(),
  sceneSnapshot: jsonb("scene_snapshot").notNull(),
  turnNumber: integer("turn_number").notNull().default(0),
  activeQuestion: jsonb("active_question"), // QuestionContext | null, includes private guide
  assistanceProvided: boolean("assistance_provided").notNull().default(false),
  latestParentSummary: text("latest_parent_summary"),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const interactions = pgTable(
  "interactions",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.sessionId, { onDelete: "cascade" }),
    interactionId: text("interaction_id").notNull(),
    turnNumber: integer("turn_number").notNull(),
    sceneId: text("scene_id").notNull(),
    objectiveId: text("objective_id").notNull(),
    questionId: text("question_id").notNull(),
    questionText: text("question_text").notNull(),
    answerGuide: text("answer_guide").notNull(), // private
    transcript: text("transcript").notNull(),
    responseType: text("response_type").notNull(), // "teaching" | "clarification"
    responseText: text("response_text").notNull(),
    nextQuestion: jsonb("next_question"), // QuestionContext | null, includes private guide
    answerStatus: text("answer_status").notNull(),
    evidence: text("evidence"),
    possibleMisconception: text("possible_misconception"),
    assistanceBefore: boolean("assistance_before").notNull(),
    assistanceInResponse: boolean("assistance_in_response").notNull(),
    parentSummary: text("parent_summary"),
    turnResponse: jsonb("turn_response").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.interactionId] }),
    unique("interactions_session_turn_unique").on(t.sessionId, t.turnNumber),
  ],
);

// Kept apart so parent-facing queries never touch drafts (learning-progress-plan.md §4, §11).
export const interactionDiagnostics = pgTable(
  "interaction_diagnostics",
  {
    sessionId: text("session_id").notNull(),
    interactionId: text("interaction_id").notNull(),
    lunaDraft: jsonb("luna_draft"),
    transcriptionModel: text("transcription_model"),
    lunaModel: text("luna_model"),
    promptRevision: text("prompt_revision"),
    transcriptionMs: integer("transcription_ms"),
    lunaMs: integer("luna_ms"),
    precommitMs: integer("precommit_ms"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.interactionId] }),
    foreignKey({
      name: "interaction_diagnostics_interaction_fk",
      columns: [t.sessionId, t.interactionId],
      foreignColumns: [interactions.sessionId, interactions.interactionId],
    }).onDelete("cascade"),
  ],
);

// Time-ordered log of learning events: a TimescaleDB hypertable on Tiger Cloud
// (drizzle/0002_learning_events_hypertable.sql). Hypertables can't have unique keys without the
// time column, so this table has no primary key; it's append-only and never read for replay.
// Parent-safe by construction: no transcripts, guides, drafts or audio.
export const learningEvents = pgTable(
  "learning_events",
  {
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.sessionId, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // "session_started" | "answer_committed"
    interactionId: text("interaction_id"),
    turnNumber: integer("turn_number"),
    objectiveId: text("objective_id").notNull(),
    answerStatus: text("answer_status"),
    assistanceInResponse: boolean("assistance_in_response"),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [index("learning_events_session_time_idx").on(t.sessionId, t.eventTime)],
);

// What the parent wants more (or less) of, per subject. One row per learner; "default" until
// learner accounts exist. Read by GET /api/parent/preferences so Play mode can use it later.
export const parentPreferences = pgTable("parent_preferences", {
  learnerKey: text("learner_key").primaryKey(),
  focus: jsonb("focus").notNull(), // { math: "less" | "usual" | "more", english: …, science: … }
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const masteryResets = pgTable("mastery_resets", {
  learnerKey: text("learner_key").notNull(),
  skillId: text("skill_id").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
}, t => [primaryKey({ columns: [t.learnerKey, t.skillId] })]);

// ---- Play-mode session trace (lib/play/trace.ts). Postgres is the record; Convex only gets pings. ----

// One row per viewing.
export const playSessions = pgTable("play_sessions", {
  sessionId: text("session_id").primaryKey(),
  learnerKey: text("learner_key").notNull().default("default"),
  episodeId: text("episode_id").notNull(),
  language: text("language").notNull().default(""), // language being practised, "" = off
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  watchedSeconds: integer("watched_seconds"),
});

// Raw trace: every event, append-only. A TimescaleDB hypertable on Tiger Cloud (0005 migration).
// The unique key includes event_time, as hypertables require; it makes retried batches no-ops.
export const playEvents = pgTable(
  "play_events",
  {
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => playSessions.sessionId, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    eventType: text("event_type").notNull(),
    turnId: text("turn_id"),
    payload: jsonb("payload").notNull(), // the full PlayEvent; may hold what the kid said (parent-only)
  },
  (t) => [unique("play_events_session_seq_time").on(t.sessionId, t.seq, t.eventTime)],
);

// One row per pause, re-folded from play_events on every batch. Dashboards and the chat read this.
export const playTurns = pgTable(
  "play_turns",
  {
    turnId: text("turn_id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => playSessions.sessionId, { onDelete: "cascade" }),
    turnNumber: integer("turn_number").notNull(),
    spotId: text("spot_id").notNull(),
    question: text("question").notNull(),
    expectedAnswer: text("expected_answer"), // null: open question
    momentSeconds: real("moment_seconds"), // where in the episode the show paused
    skill: text("skill").notNull(),
    topic: text("topic").notNull(),
    subject: text("subject").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    outcome: text("outcome"), // first_try | after_help | gave | no_answer | error | null (unfinished)
    answerStatus: text("answer_status").notNull(),
    tries: integer("tries").notNull(),
    nudges: integer("nudges").notNull(),
    transcript: text("transcript").notNull(), // parent-only
    doraReply: text("dora_reply"),
    replyMs: integer("reply_ms"),
    pronunciation: text("pronunciation"),
    practiceLanguage: text("practice_language"),
    practiceWord: text("practice_word"),
    practiceOutcome: text("practice_outcome"),
  },
  (t) => [index("play_turns_session_idx").on(t.sessionId, t.turnNumber), index("play_turns_topic_idx").on(t.topic, t.startedAt)],
);
