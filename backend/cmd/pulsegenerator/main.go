package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/pulse"
)

func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}

	gen := pulse.NewGenerator(cfg, db.New(pool), dynamo.NewClient(cfg))

	awslambda.Start(func(ctx context.Context, event events.EventBridgeEvent) error {
		var detail struct {
			UserID string `json:"user_id"`
		}
		if err := json.Unmarshal([]byte(event.Detail), &detail); err != nil {
			log.Printf("pulsegenerator: parse event detail: %v", err)
			return nil // malformed event — skip silently, don't fail
		}
		if detail.UserID == "" {
			return nil
		}

		if err := gen.RunForUser(ctx, detail.UserID); err != nil {
			// Non-fatal: don't return the error so EventBridge doesn't retry.
			// Structured field distinguishes real failures from intentional skips
			// (compile_count < 1, no recent session) in CloudWatch Logs Insights:
			//   filter @message like "pulse_generator_error"
			log.Printf(`{"level":"error","event":"pulse_generator_error","user_id":%q,"error":%q}`,
				detail.UserID, err.Error())
		}
		return nil
	})
}
