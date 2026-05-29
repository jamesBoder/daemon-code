package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/services/ai"
)

func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}

	analyst := ai.NewAnalyst(cfg, db.New(pool))

	// SQS trigger: one invocation per user, automatic retry on error
	awslambda.Start(func(ctx context.Context, event events.SQSEvent) error {
		for _, record := range event.Records {
			if err := analyst.RunForUser(ctx, record.Body); err != nil {
				return err
			}
		}
		return nil
	})
}
