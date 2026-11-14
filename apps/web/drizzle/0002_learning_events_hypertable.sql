-- Make learning_events a TimescaleDB hypertable partitioned by event_time (1-day chunks).
-- Guarded: on Postgres without TimescaleDB (PGlite in tests, local Postgres) it stays a plain table,
-- and every query in the app still works.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('learning_events', by_range('event_time', INTERVAL '1 day'));
  END IF;
END
$$;
--> statement-breakpoint
-- Backfill events for sessions and answers saved before this table existed.
INSERT INTO learning_events (event_time, session_id, event_type, objective_id, is_sample)
SELECT created_at, session_id, 'session_started', objective_id, is_sample
FROM sessions;
--> statement-breakpoint
INSERT INTO learning_events (
  event_time, session_id, event_type, interaction_id, turn_number,
  objective_id, answer_status, assistance_in_response, is_sample
)
SELECT i.completed_at, i.session_id, 'answer_committed', i.interaction_id, i.turn_number,
       i.objective_id, i.answer_status, i.assistance_in_response, s.is_sample
FROM interactions i
JOIN sessions s ON s.session_id = i.session_id;
