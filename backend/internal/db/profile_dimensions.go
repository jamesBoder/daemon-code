package db

import (
	"context"

	"github.com/google/uuid"
)

// SnapshotDaemonAccuracy copies the current daemon_accuracy into daemon_accuracy_last_compile.
// Must be called before UpdateShadowProfile so grim trigger detection in the next compile
// has the correct pre-Analyst baseline to compare against.
func (q *Queries) SnapshotDaemonAccuracy(ctx context.Context, userID uuid.UUID, currentAccuracy int32) error {
	_, err := q.db.Exec(ctx,
		`UPDATE shadow_profiles SET daemon_accuracy_last_compile = $2 WHERE user_id = $1`,
		userID, currentAccuracy,
	)
	return err
}

// UpdateProfileDimensions writes the Analyst's updated dimension scores to the profile.
// When shouldSnapshot is true (every snapshotInterval compiles), the current dimensions
// are rotated into profile_dimensions_prev before writing the new value — this provides
// the before/after snapshot needed for Monthly Chapters arc narration.
func (q *Queries) UpdateProfileDimensions(ctx context.Context, userID uuid.UUID, dimensions []byte, shouldSnapshot bool) error {
	if shouldSnapshot {
		_, err := q.db.Exec(ctx, `
			UPDATE shadow_profiles
			SET profile_dimensions      = $2,
			    profile_dimensions_prev = profile_dimensions
			WHERE user_id = $1`,
			userID, dimensions,
		)
		return err
	}
	_, err := q.db.Exec(ctx,
		`UPDATE shadow_profiles SET profile_dimensions = $2 WHERE user_id = $1`,
		userID, dimensions,
	)
	return err
}
