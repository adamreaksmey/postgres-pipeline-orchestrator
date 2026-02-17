-- DB is source of truth + event emitter: on every INSERT into job_logs, Postgres NOTIFYs.
-- App only INSERTs; app LISTENs and forwards to SSE. No app-side NOTIFY.

-- dont need to run this, this is just for references or if you wanna run this somewhere manually - your choice

CREATE OR REPLACE FUNCTION notify_job_log_insert()
RETURNS TRIGGER AS $$
DECLARE
  payload text;
  line_trunc text;
BEGIN
  -- PG NOTIFY payload limit 8000 bytes; leave room for JSON wrapper
  line_trunc := left(NEW.log_line, 7000);
  IF length(NEW.log_line) > 7000 THEN
    line_trunc := line_trunc || '…';
  END IF;
  payload := json_build_object(
    'job_id', NEW.job_id,
    'log_line', line_trunc,
    'log_level', coalesce(NEW.log_level, 'info'),
    'timestamp', NEW.timestamp,
    'id', NEW.id
  )::text;
  PERFORM pg_notify('job_logs', payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_logs_notify ON job_logs;
CREATE TRIGGER job_logs_notify
  AFTER INSERT ON job_logs
  FOR EACH ROW
  EXECUTE PROCEDURE notify_job_log_insert();
