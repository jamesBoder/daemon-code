package db

import (
	"context"

	"github.com/google/uuid"
)

// GetRecentResponses returns card_responses from the most recent limitDates distinct session dates,
// ordered newest session first then by responded_at within each session.
// Used for cross-session signal aggregation (k_level, grim trigger) in Analyst context assembly.
func (q *Queries) GetRecentResponses(ctx context.Context, userID uuid.UUID, limitDates int) ([]CardResponse, error) {
	const query = `
		WITH recent AS (
			SELECT DISTINCT session_date
			FROM card_responses
			WHERE user_id = $1
			ORDER BY session_date DESC
			LIMIT $2
		)
		SELECT id, user_id, fragment_id, fragment_type, response_data, session_date, responded_at
		FROM card_responses
		WHERE user_id = $1 AND session_date IN (SELECT session_date FROM recent)
		ORDER BY session_date DESC, responded_at ASC`

	rows, err := q.db.Query(ctx, query, userID, limitDates)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []CardResponse
	for rows.Next() {
		var i CardResponse
		if err := rows.Scan(
			&i.ID, &i.UserID, &i.FragmentID, &i.FragmentType,
			&i.ResponseData, &i.SessionDate, &i.RespondedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}
