CREATE TABLE "learning_events" (
	"event_time" timestamp with time zone NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"interaction_id" text,
	"turn_number" integer,
	"objective_id" text NOT NULL,
	"answer_status" text,
	"assistance_in_response" boolean,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_session_id_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_events_session_time_idx" ON "learning_events" USING btree ("session_id","event_time");