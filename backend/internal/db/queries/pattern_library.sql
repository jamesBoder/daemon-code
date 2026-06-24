-- name: GetPatternLibrary :many
SELECT * FROM pattern_library
WHERE user_id = $1
ORDER BY updated_at DESC;

-- name: InsertPattern :one
INSERT INTO pattern_library (user_id, name, state, strength, unnamed, first_detected, daemon_note, signal_key)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: UpdatePattern :one
-- Nightly Analyst is the source of truth: it sets the authoritative strength and
-- resets live_delta to 0, absorbing any in-session drift accrued since last run.
UPDATE pattern_library
SET name        = $2,
    state       = $3,
    strength    = $4,
    unnamed     = $5,
    last_seen   = $6,
    daemon_note = $7,
    signal_key  = $8,
    live_delta  = 0,
    updated_at  = NOW()
WHERE id = $1
RETURNING *;

-- name: InsertProvisionalPattern :one
-- Live (non-AI) seeding of an unnamed "still forming" pattern once a dimension
-- has held across enough sessions. Strength is derived from birth-signal
-- confidence by the caller; the nightly Analyst later names or folds it in.
INSERT INTO pattern_library (user_id, name, state, strength, unnamed, first_detected, daemon_note, signal_key)
VALUES ($1, NULL, 'new', $2, TRUE, $3, '', $4)
RETURNING *;

-- name: FoldLiveDeltaIntoStrength :exec
-- Nightly safety net: absorb any remaining provisional live drift into the
-- authoritative strength for patterns the Analyst did not update this compile
-- (UpdatePattern already zeroed the ones it touched). Guarantees live_delta never
-- carries across compiles, even for processes the model left alone.
UPDATE pattern_library
SET strength   = LEAST(strength + live_delta, 100),
    live_delta = 0
WHERE user_id = $1 AND live_delta > 0;

-- name: ApplyLiveDelta :exec
-- Live, deterministic in-session accrual. Caps live_delta at the per-window
-- ceiling ($3), wakes a sleeping pattern, and bumps recency so the process tab
-- can show "stirred just now". Never touches base strength.
UPDATE pattern_library
SET live_delta = LEAST(live_delta + $2, $3),
    state      = CASE WHEN state = 'sleeping' THEN 'running' ELSE state END,
    last_seen  = $4,
    updated_at = NOW()
WHERE id = $1;
