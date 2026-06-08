package db

import (
	"context"

	"github.com/google/uuid"
)

// SnapshotScores copies current score values into the *_prev columns.
// Called by the Analyst at compile-count milestones (every 30 compiles) to
// provide a baseline for the month-over-month trend shown on the Home screen.
// Kept outside sqlc-generated files so regeneration does not clobber it.
func (q *Queries) SnapshotScores(ctx context.Context, arg SnapshotScoresParams) error {
	_, err := q.db.Exec(ctx,
		`UPDATE shadow_profiles
		 SET kernel_access_prev   = $2,
		     daemon_accuracy_prev = $3,
		     decoded_lines_prev   = $4
		 WHERE user_id = $1`,
		arg.UserID,
		arg.KernelAccessPrev,
		arg.DaemonAccuracyPrev,
		arg.DecodedLinesPrev,
	)
	return err
}

type SnapshotScoresParams struct {
	UserID             uuid.UUID
	KernelAccessPrev   int32
	DaemonAccuracyPrev int32
	DecodedLinesPrev   int32
}
