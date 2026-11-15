CREATE TABLE "parent_preferences" (
	"learner_key" text PRIMARY KEY NOT NULL,
	"focus" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
