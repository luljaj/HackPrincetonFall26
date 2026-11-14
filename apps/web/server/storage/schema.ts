import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
