package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/ai"
)

func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}

	narrator := ai.NewNarrator(cfg, db.New(pool), dynamo.NewClient(cfg))
	awslambda.Start(func(ctx context.Context, event events.EventBridgeEvent) error {
		return narrator.Run(ctx, event)
	})
}
