package db

import (
	"context"

	"github.com/google/uuid"
)

// TomorrowPrediction is the Analyst-authored prediction the next deck's
// prediction duel serves verbatim. Text empty = no prediction written tonight;
// the deck generator falls back to its template.
type TomorrowPrediction struct {
	Text        string
	PatternName string
}

// SetTomorrowPrediction stores tonight's Analyst-authored duel prediction.
// Called every compile — an empty text intentionally clears the previous
// night's prediction so a stale claim is never served twice.
func (q *Queries) SetTomorrowPrediction(ctx context.Context, userID uuid.UUID, text, patternName string) error {
	const query = `
		UPDATE shadow_profiles
		SET tomorrow_prediction = $2, tomorrow_prediction_pattern = $3
		WHERE user_id = $1`
	_, err := q.db.Exec(ctx, query, userID, text, patternName)
	return err
}

// GetTomorrowPrediction returns the prediction written by the most recent
// compile. Used by the deck generator, which runs after the Analyst in the
// nightly chain.
func (q *Queries) GetTomorrowPrediction(ctx context.Context, userID uuid.UUID) (TomorrowPrediction, error) {
	const query = `
		SELECT tomorrow_prediction, tomorrow_prediction_pattern
		FROM shadow_profiles
		WHERE user_id = $1`
	var p TomorrowPrediction
	err := q.db.QueryRow(ctx, query, userID).Scan(&p.Text, &p.PatternName)
	return p, err
}
