package main

import (
	"context"
	"log"
	"time"

	awslambda "github.com/aws/aws-lambda-go/lambda"
	"github.com/jackc/pgx/v5/pgtype"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/notifier"
)

// The Orchestrator no longer sweeps every onboarded user into the Analyst
// queue on the nightly cron — that's what made the daemon keep "compiling"
// users who hadn't opened the app in weeks (see docs/simplify-pass.md).
// Analyst is triggered directly from PostSessionComplete, only on days a
// session actually finished.
//
// The nightly cron now drives the "haven't played today" reminder: every
// onboarded user with no card responses for today's UTC date gets a plain
// push nudge (if they've subscribed). One failed push never blocks the rest.
func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	q := db.New(pool)
	n := notifier.New(cfg, dynamo.NewClient(cfg))

	awslambda.Start(func(ctx context.Context) error {
		today := pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}
		ids, err := q.GetUsersWithoutSessionOn(ctx, today)
		if err != nil {
			return err
		}
		sent := 0
		for _, id := range ids {
			if err := n.Remind(ctx, id); err != nil {
				log.Printf("orchestrator: remind user %s: %v", id, err)
				continue
			}
			sent++
		}
		log.Printf("orchestrator: %d users without a session today, %d reminders processed", len(ids), sent)
		return nil
	})
}
