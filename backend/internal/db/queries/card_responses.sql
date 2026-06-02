-- name: InsertCardResponse :exec
INSERT INTO card_responses (user_id, fragment_id, fragment_type, response_data, session_date)
VALUES ($1, $2, $3, $4, $5);

-- name: GetResponsesForDate :many
SELECT * FROM card_responses
WHERE user_id = $1 AND session_date = $2
ORDER BY responded_at ASC;
