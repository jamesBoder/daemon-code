-- name: GetPatternLibrary :many
SELECT * FROM pattern_library
WHERE user_id = $1
ORDER BY updated_at DESC;

-- name: InsertPattern :one
INSERT INTO pattern_library (user_id, name, state, strength, unnamed, first_detected, daemon_note)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdatePattern :one
UPDATE pattern_library
SET name        = $2,
    state       = $3,
    strength    = $4,
    unnamed     = $5,
    last_seen   = $6,
    daemon_note = $7,
    updated_at  = NOW()
WHERE id = $1
RETURNING *;
