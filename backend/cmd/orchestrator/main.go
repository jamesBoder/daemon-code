package main

import (
	"context"
	"log"

	awslambda "github.com/aws/aws-lambda-go/lambda"
)

// The Orchestrator no longer sweeps every onboarded user into the Analyst
// queue on the nightly cron — that's what made the daemon keep "compiling"
// users who hadn't opened the app in weeks (see docs/simplify-pass.md).
// Analyst is now triggered directly from PostSessionComplete, only on days
// a session actually finished.
//
// This handler is a placeholder no-op: the nightly cron trigger stays wired
// (terraform/modules/compute/main.tf) so it's ready to be repurposed into a
// "haven't played today" reminder check, planned as separate follow-up work.
func main() {
	awslambda.Start(func(ctx context.Context) error {
		log.Println("orchestrator: no-op (Analyst now triggers on session completion, not nightly sweep)")
		return nil
	})
}
