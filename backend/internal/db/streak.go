package db

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// GetSessionDates returns distinct session dates for the user, newest first, capped at 90.
// Kept outside sqlc-generated files so regeneration doesn't clobber it.
func (q *Queries) GetSessionDates(ctx context.Context, userID uuid.UUID) ([]time.Time, error) {
	const query = `
		SELECT DISTINCT session_date
		FROM card_responses
		WHERE user_id = $1
		ORDER BY session_date DESC
		LIMIT 90
	`
	rows, err := q.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dates []time.Time
	for rows.Next() {
		var d pgtype.Date
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		if d.Valid {
			dates = append(dates, d.Time)
		}
	}
	return dates, rows.Err()
}
