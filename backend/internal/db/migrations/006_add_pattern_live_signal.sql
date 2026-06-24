-- Live process movement: a dimensional fingerprint so the session-complete path
-- can attribute deterministic, in-session strength changes to the right pattern,
-- plus a provisional accrual the nightly Analyst absorbs and resets.
ALTER TABLE pattern_library
ADD COLUMN IF NOT EXISTS signal_key TEXT    NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS live_delta INTEGER NOT NULL DEFAULT 0;
