package main

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"

	awslambda "github.com/aws/aws-lambda-go/lambda"
	"github.com/google/uuid"
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
const (
	// Skip accounts younger than this so someone who just finished onboarding
	// isn't nudged for a session they haven't had a chance to start.
	reminderMinAccountAge = 24 * time.Hour
	// Pushes are network-bound; a small worker pool keeps the run well inside
	// the Lambda timeout as the user base grows.
	reminderWorkers = 8
)

func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	q := db.New(pool)
	n := notifier.New(cfg, dynamo.NewClient(cfg))

	awslambda.Start(func(ctx context.Context) error {
		now := time.Now().UTC()
		ids, err := q.GetUsersWithoutSessionOn(ctx, db.GetUsersWithoutSessionOnParams{
			SessionDate: pgtype.Date{Time: now.Truncate(24 * time.Hour), Valid: true},
			CreatedAt:   pgtype.Timestamptz{Time: now.Add(-reminderMinAccountAge), Valid: true},
		})
		if err != nil {
			return err
		}

		var sent, failed atomic.Int64
		var wg sync.WaitGroup
		work := make(chan uuid.UUID)
		for i := 0; i < reminderWorkers; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for id := range work {
					if err := n.Remind(ctx, id); err != nil {
						log.Printf("orchestrator: remind user %s: %v", id, err)
						failed.Add(1)
						continue
					}
					sent.Add(1)
				}
			}()
		}
		for _, id := range ids {
			work <- id
		}
		close(work)
		wg.Wait()

		log.Printf("orchestrator: %d users without a session today; %d processed, %d failed", len(ids), sent.Load(), failed.Load())
		return nil
	})
}
