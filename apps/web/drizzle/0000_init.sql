CREATE TABLE "interaction_diagnostics" (
	"session_id" text NOT NULL,
	"interaction_id" text NOT NULL,
	"luna_draft" jsonb,
	"transcription_model" text,
	"luna_model" text,
	"prompt_revision" text,
	"transcription_ms" integer,
	"luna_ms" integer,
	"precommit_ms" integer,
	CONSTRAINT "interaction_diagnostics_session_id_interaction_id_pk" PRIMARY KEY("session_id","interaction_id")
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"session_id" text NOT NULL,
	"interaction_id" text NOT NULL,
	"turn_number" integer NOT NULL,
	"scene_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"question_id" text NOT NULL,
	"question_text" text NOT NULL,
	"answer_guide" text NOT NULL,
	"transcript" text NOT NULL,
	"response_type" text NOT NULL,
	"response_text" text NOT NULL,
	"next_question" jsonb,
	"answer_status" text NOT NULL,
	"evidence" text,
	"possible_misconception" text,
	"assistance_before" boolean NOT NULL,
	"assistance_in_response" boolean NOT NULL,
	"parent_summary" text,
	"turn_response" jsonb NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "interactions_session_id_interaction_id_pk" PRIMARY KEY("session_id","interaction_id"),
	CONSTRAINT "interactions_session_turn_unique" UNIQUE("session_id","turn_number")
);
--> statement-breakpoint
CREATE TABLE "learners" (
	"learner_id" text PRIMARY KEY NOT NULL,
	"display_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"learner_id" text,
	"scene_id" text NOT NULL,
	"objective_id" text NOT NULL,
	"scene_snapshot" jsonb NOT NULL,
	"turn_number" integer DEFAULT 0 NOT NULL,
	"active_question" jsonb,
	"assistance_provided" boolean DEFAULT false NOT NULL,
	"latest_parent_summary" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interaction_diagnostics" ADD CONSTRAINT "interaction_diagnostics_interaction_fk" FOREIGN KEY ("session_id","interaction_id") REFERENCES "public"."interactions"("session_id","interaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_session_id_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_learner_id_learners_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("learner_id") ON DELETE set null ON UPDATE no action;