package db

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// UpdatePollyVoice sets a user's preferred Polly voice override.
// Kept outside sqlc-generated files so regeneration does not clobber it.
// Pass an invalid pgtype.Text to clear the override and revert to archetype default.
func (q *Queries) UpdatePollyVoice(ctx context.Context, userID uuid.UUID, voice pgtype.Text) error {
	_, err := q.db.Exec(ctx,
		`UPDATE shadow_profiles SET polly_voice = $2 WHERE user_id = $1`,
		userID, voice,
	)
	return err
}
