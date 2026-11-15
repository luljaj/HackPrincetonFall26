-- Make play_events a TimescaleDB hypertable partitioned by event_time (1-day chunks).
-- Guarded like 0002: without TimescaleDB (PGlite in tests, local Postgres) it stays a plain table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('play_events', by_range('event_time', INTERVAL '1 day'));
  END IF;
END
$$;
