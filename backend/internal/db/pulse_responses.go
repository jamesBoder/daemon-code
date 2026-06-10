package db

import (
	"context"

	"github.com/google/uuid"
)

// HasRecentSession returns true if the user has any non-pulse card_responses in the last 14 days.
// Used by PulseGenerator run gate to skip users who haven't had a session recently.
func (q *Queries) HasRecentSession(ctx context.Context, userID uuid.UUID) (bool, error) {
	var exists bool
	err := q.db.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM card_responses
			WHERE user_id = $1
			  AND fragment_type != 'pulse'
			  AND session_date >= CURRENT_DATE - INTERVAL '14 days'
		)
	`, userID).Scan(&exists)
	return exists, err
}

// GetRecentPulseResponses returns card_responses with fragment_type 'pulse' from the last 14 days.
// Used by PulseGenerator to enforce the 14-day stimulus repeat gap.
func (q *Queries) GetRecentPulseResponses(ctx context.Context, userID uuid.UUID) ([]CardResponse, error) {
	rows, err := q.db.Query(ctx, `
		SELECT id, user_id, fragment_id, fragment_type, response_data, session_date, responded_at
		FROM card_responses
		WHERE user_id = $1
		  AND fragment_type = 'pulse'
		  AND session_date >= CURRENT_DATE - INTERVAL '14 days'
		ORDER BY session_date DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []CardResponse
	for rows.Next() {
		var i CardResponse
		if err := rows.Scan(
			&i.ID,
			&i.UserID,
			&i.FragmentID,
			&i.FragmentType,
			&i.ResponseData,
			&i.SessionDate,
			&i.RespondedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}
