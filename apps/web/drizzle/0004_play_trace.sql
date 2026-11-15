CREATE TABLE "play_events" (
	"event_time" timestamp with time zone NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event_type" text NOT NULL,
	"turn_id" text,
	"payload" jsonb NOT NULL,
	CONSTRAINT "play_events_session_seq_time" UNIQUE("session_id","seq","event_time")
);
--> statement-breakpoint
CREATE TABLE "play_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"learner_key" text DEFAULT 'default' NOT NULL,
	"episode_id" text NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"watched_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "play_turns" (
	"turn_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"turn_number" integer NOT NULL,
	"spot_id" text NOT NULL,
	"question" text NOT NULL,
	"expected_answer" text,
	"moment_seconds" real,
	"skill" text NOT NULL,
	"topic" text NOT NULL,
	"subject" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"outcome" text,
	"answer_status" text NOT NULL,
	"tries" integer NOT NULL,
	"nudges" integer NOT NULL,
	"transcript" text NOT NULL,
	"dora_reply" text,
	"reply_ms" integer,
	"pronunciation" text,
	"practice_language" text,
	"practice_word" text,
	"practice_outcome" text
);
--> statement-breakpoint
ALTER TABLE "play_events" ADD CONSTRAINT "play_events_session_id_play_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."play_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_turns" ADD CONSTRAINT "play_turns_session_id_play_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."play_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "play_turns_session_idx" ON "play_turns" USING btree ("session_id","turn_number");--> statement-breakpoint
CREATE INDEX "play_turns_topic_idx" ON "play_turns" USING btree ("topic","started_at");