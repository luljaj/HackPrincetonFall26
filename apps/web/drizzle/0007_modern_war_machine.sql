CREATE TABLE "lesson_progress" (
	"learner_key" text NOT NULL,
	"language" text NOT NULL,
	"lesson_id" text NOT NULL,
	"level" integer,
	"level_set_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lesson_progress_learner_key_language_lesson_id_pk" PRIMARY KEY("learner_key","language","lesson_id")
);
