package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// ClaimLiveScore atomically reserves the live session-complete scoring slot for
// the given UTC day. It returns true exactly once per user per day — the first
// caller for `day` wins the claim; every subsequent call that day returns false.
// This makes POST /session/complete idempotent: a duplicate submit (double-tap,
// retry) cannot re-accrue live_delta. Kept outside sqlc-generated files so
// regeneration doesn't clobber it.
func (q *Queries) ClaimLiveScore(ctx context.Context, userID uuid.UUID, day pgtype.Date) (bool, error) {
	const query = `
		UPDATE shadow_profiles
		SET live_scored_date = $2
		WHERE user_id = $1
		  AND (live_scored_date IS NULL OR live_scored_date <> $2)
	`
	tag, err := q.db.Exec(ctx, query, userID, day)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
