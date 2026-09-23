-- name: InsertCardResponse :exec
INSERT INTO card_responses (user_id, fragment_id, fragment_type, response_data, session_date)
VALUES ($1, $2, $3, $4, $5);

-- name: GetResponsesForDate :many
SELECT * FROM card_responses
WHERE user_id = $1 AND session_date = $2
ORDER BY responded_at ASC;

-- name: GetRecentResponsesByType :many
-- Most-recent-first, capped -- used by The Odd One Out to sample real past
-- responses as quote candidates. Bounded to a reasonably recent window so
-- quotes stay relevant to who the user is now, not a memory from a year ago.
SELECT * FROM card_responses
WHERE user_id = $1 AND fragment_type = $2
ORDER BY responded_at DESC
LIMIT $3;
