package main

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"time"

	awslambda "github.com/aws/aws-lambda-go/lambda"
	dynamotypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
)

func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	queries := db.New(pool)
	ddb := dynamo.NewClient(cfg)

	// Triggered by EventBridge after the nightly Analyst batch completes.
	awslambda.Start(func(ctx context.Context) error {
		// Must match the Narrator's ShadowState sort key — both stamp the
		// date the nightly output serves, not the write-time date.
		date := dynamo.ServiceDate(time.Now())

		users, err := queries.GetAllActiveUsers(ctx)
		if err != nil {
			return fmt.Errorf("get users: %w", err)
		}

		for _, u := range users {
			profile, err := queries.GetShadowProfile(ctx, u.ID)
			if err != nil {
				log.Printf("signalselector: get profile for user %s: %v", u.ID, err)
				continue
			}

			quote, author := selectSignal(profile.PrimaryArchetype, u.ID.String(), date)

			if err := ddb.PutSignalFields(ctx, u.ID.String(), date, quote, author); err != nil {
				var cce *dynamotypes.ConditionalCheckFailedException
				if errors.As(err, &cce) {
					// Analyst hasn't written ShadowState for today yet — home.go will use fallback.
					log.Printf("signalselector: no shadow state for user %s on %s — skipping", u.ID, date)
					continue
				}
				log.Printf("signalselector: write signal for user %s: %v", u.ID, err)
			}
		}
		return nil
	})
}

// selectSignal picks a quote deterministically from the archetype-tagged library.
// Falls back to neutral quotes if fewer than minArchetypeMatches are tagged for the archetype.
// Uses sha256(userID+date) so the same user always sees the same quote on a given day.
func selectSignal(archetype, userID, date string) (string, string) {
	matches := filterByArchetype(archetype)
	if len(matches) < minArchetypeMatches {
		matches = filterByArchetype("neutral")
	}
	if len(matches) == 0 {
		return signals[0].Quote, signals[0].Author
	}

	h := sha256.Sum256([]byte(userID + date))
	idx := binary.BigEndian.Uint64(h[:8]) % uint64(len(matches)) // #nosec G115 — bounded by len
	return matches[idx].Quote, matches[idx].Author
}

func filterByArchetype(archetype string) []signal {
	var out []signal
	for _, s := range signals {
		for _, a := range s.Archetypes {
			if a == archetype {
				out = append(out, s)
				break
			}
		}
	}
	return out
}
