package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/deck"
)

func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}

	gen := deck.NewGenerator(cfg, dynamo.NewClient(cfg), db.New(pool))
	awslambda.Start(func(ctx context.Context, event events.EventBridgeEvent) error {
		return gen.Run(ctx, event)
	})
}
