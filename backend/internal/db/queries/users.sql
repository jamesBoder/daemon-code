-- name: CreateUser :one
INSERT INTO users (email, password_hash, timezone)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: UpdateOnboardingComplete :exec
UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = $1;

-- name: GetAllActiveUsers :many
SELECT id, timezone FROM users WHERE onboarding_complete = TRUE;

-- name: GetUsersWithoutSessionOn :many
-- $1 = today's session date, $2 = only users created before this instant
SELECT u.id FROM users u
WHERE u.onboarding_complete = TRUE
  AND u.created_at < $2
  AND NOT EXISTS (
    SELECT 1 FROM card_responses c WHERE c.user_id = u.id AND c.session_date = $1
  );
