CREATE TABLE "mastery_resets" (
	"learner_key" text NOT NULL,
	"skill_id" text NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mastery_resets_learner_key_skill_id_pk" PRIMARY KEY("learner_key","skill_id")
);
