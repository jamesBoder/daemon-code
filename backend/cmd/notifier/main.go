package main

import (
	"context"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/notifier"
)

func main() {
	cfg := appconfig.Load()
	n := notifier.New(cfg, dynamo.NewClient(cfg))
	awslambda.Start(func(ctx context.Context, event events.EventBridgeEvent) error {
		return n.Run(ctx, event)
	})
}
