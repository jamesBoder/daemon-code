-- Idempotency for the live session-complete scorer: records the UTC day the
-- deterministic scorer last ran for a user, so a duplicate POST /session/complete
-- (double-tap, retry) cannot re-accrue live_delta a second time the same day.
ALTER TABLE shadow_profiles
ADD COLUMN IF NOT EXISTS live_scored_date DATE;
