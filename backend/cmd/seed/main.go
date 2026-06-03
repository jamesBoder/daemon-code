// seed — writes a test DailyDeck to DynamoDB for a given user.
// Usage:
//
//	source .env.local && go run ./backend/cmd/seed -email you@example.com
//
// The deck contains one of each fragment type so the full Session flow can be
// tested locally before the nightly Analyst pipeline has run.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
)

func main() {
	email := flag.String("email", "", "email address of the user to seed (required)")
	flag.Parse()

	if *email == "" {
		log.Fatal("usage: seed -email <email>")
	}

	cfg := config.Load()

	// ── Postgres: look up user_id by email ────────────────────────────────────
	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	defer pool.Close()

	ctx := context.Background()
	queries := db.New(pool)

	user, err := queries.GetUserByEmail(ctx, *email)
	if err != nil {
		log.Fatalf("user not found for email %q: %v", *email, err)
	}

	userID := user.ID.String()
	date := time.Now().UTC().Format("2006-01-02")
	ttl := time.Now().UTC().Add(48 * time.Hour).Unix()

	fmt.Printf("seeding deck for user %s (%s) on %s\n", *email, userID, date)

	// ── Build test fragments ──────────────────────────────────────────────────
	reactionPayload, _ := json.Marshal(map[string]any{
		"words":          []string{"control", "loss", "trust", "fear", "peace", "isolation", "worth", "shame"},
		"duration_ms":    200,
		"archetype_hint": "default",
	})

	scalePayload, _ := json.Marshal(map[string]any{
		"left":  "certainty",
		"right": "surrender",
	})

	duelPayload, _ := json.Marshal(map[string]any{
		"pattern":    "You tend to withdraw when you feel unheard.",
		"prediction": "You will recognise this.",
	})

	fragments := []dynamo.Fragment{
		{
			ID:         "seed-reaction-1",
			Type:       "reaction_test",
			Payload:    string(reactionPayload),
			DaemonNote: "The daemon noticed which words slowed you down.",
			Order:      0,
		},
		{
			ID:         "seed-scale-1",
			Type:       "weighted_scale",
			Payload:    string(scalePayload),
			DaemonNote: "Where you land here shapes everything downstream.",
			Order:      1,
		},
		{
			ID:         "seed-duel-1",
			Type:       "prediction_duel",
			Payload:    string(duelPayload),
			DaemonNote: "The daemon made a guess. Was it right?",
			Order:      2,
		},
	}

	// ── DynamoDB: write the deck ──────────────────────────────────────────────
	dynamoClient := dynamo.NewClient(cfg)

	deck := dynamo.DailyDeck{
		UserID:    userID,
		Date:      date,
		Fragments: fragments,
		TTL:       ttl,
	}

	if err := dynamoClient.PutDailyDeck(ctx, deck); err != nil {
		log.Fatalf("put deck: %v", err)
	}

	fmt.Printf("✓ deck seeded — %d fragments written to %s\n", len(fragments), date)
	fmt.Println("  reload /session to test the full flow")
}
