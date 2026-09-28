package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/deck"
)

// On-demand deck generation for a single returning user (e.g. missed a day,
// opened /session/today with no deck for today) -- split out from the API
// Lambda specifically because GenerateForUser can invoke a live Anthropic
// call (buildPulse) with its own 60s client timeout, which the 30s API
// Lambda timeout could never survive: AWS kills the request before the
// Anthropic call would even time out on its own, 504ing the user and
// dropping the deck write entirely. Runs here instead, sized like the
// nightly deckgen Lambda (60s), triggered by SQS from
// GetSessionToday (backend/internal/handlers/session.go) rather than
// EventBridge -- one message per affected user, not a fan-out event.
func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}

	gen := deck.NewGenerator(cfg, dynamo.NewClient(cfg), db.New(pool))

	awslambda.Start(func(ctx context.Context, event events.SQSEvent) error {
		for _, record := range event.Records {
			var msg struct {
				UserID string `json:"user_id"`
			}
			if err := json.Unmarshal([]byte(record.Body), &msg); err != nil {
				log.Printf("deckgenondemand: bad message body: %v", err)
				continue
			}
			userID, err := uuid.Parse(msg.UserID)
			if err != nil {
				log.Printf("deckgenondemand: bad user_id %q: %v", msg.UserID, err)
				continue
			}
			// Plain UTC today, not dynamo.ServiceDate -- this path fires
			// mid-day specifically because *today's* deck is missing;
			// ServiceDate rolls to tomorrow past 12:00 UTC, which would
			// stamp the deck for the wrong date on an afternoon request.
			today := time.Now().UTC().Format("2006-01-02")
			if err := gen.GenerateForUser(ctx, userID, today); err != nil {
				log.Printf("deckgenondemand: generate for user %s: %v", userID, err)
				return err // let SQS retry / DLQ on real failures
			}
		}
		return nil
	})
}
