-- name: InsertMoodLog :exec
INSERT INTO mood_logs (user_id, mood_score, note, log_date)
VALUES ($1, $2, $3, $4);

-- name: GetMoodLogsForDate :many
SELECT * FROM mood_logs
WHERE user_id = $1 AND log_date = $2
ORDER BY logged_at ASC;
