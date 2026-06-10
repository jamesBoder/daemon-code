// devrun — seeds N days of fake session data and runs the full analyst pipeline
// for a given user, so you can test compile output, archetype assignment, process
// patterns, and Home screen stats without waiting for the nightly Lambda run.
//
// Usage:
//
//	source .env.local && go run ./backend/cmd/devrun -email you@example.com
//	source .env.local && go run ./backend/cmd/devrun -email you@example.com -days 35
//	source .env.local && go run ./backend/cmd/devrun -email you@example.com -days 7 -skip-narrator
//
// Each run is idempotent — existing responses for the seeded dates are cleared first.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/ai"
	"github.com/jamesboder/daemon-code/internal/signal"
)

// ── fake response payload shapes (must match context.go) ─────────────────────

type rtTap struct {
	Word           string `json:"word"`
	ReactionTimeMs int    `json:"reactionTimeMs"`
}
type rtPayload struct {
	Tapped []rtTap `json:"tapped"`
	Total  int     `json:"total"`
}

type wsItem struct {
	Left               string  `json:"left"`
	Right              string  `json:"right"`
	Value              float64 `json:"value"`
	DeliberationTimeMs int     `json:"deliberationTimeMs"`
}

type duelPayload struct {
	Matched            bool `json:"matched"`
	DuelResponseTimeMs int  `json:"duelResponseTimeMs"`
}

// ── word pools for reaction_test ──────────────────────────────────────────────

// These words are all present in signal.Words and cover both approach and avoidance.
var devWords = []string{
	"loss", "rejection", "failure", "isolation", "doubt",
	"purpose", "connection", "growth", "trust", "clarity",
	"abandonment", "grief", "constraint", "distance",
	"achievement", "belonging", "freedom", "resilience",
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	email := flag.String("email", "", "user email (required)")
	days := flag.Int("days", 7, "number of session days to simulate (1–60)")
	skipNarrator := flag.Bool("skip-narrator", false, "skip Narrator (no daemon prose or audio generated)")
	flag.Parse()

	if *email == "" {
		log.Fatal("usage: devrun -email <email> [-days N] [-skip-narrator]")
	}
	if *days < 1 || *days > 60 {
		log.Fatal("-days must be between 1 and 60")
	}

	ctx := context.Background()
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	defer pool.Close()

	queries := db.New(pool)

	user, err := queries.GetUserByEmail(ctx, *email)
	if err != nil {
		log.Fatalf("user not found for %q: %v", *email, err)
	}
	userID := user.ID

	// Ensure shadow profile exists (new accounts start without one until onboarding).
	if _, err := queries.GetShadowProfile(ctx, userID); err != nil {
		if _, err := queries.CreateShadowProfile(ctx, userID); err != nil {
			log.Fatalf("create shadow profile: %v", err)
		}
	}

	analyst := ai.NewAnalyst(cfg, queries)

	fmt.Printf("devrun: simulating %d day(s) for %s (%s)\n\n", *days, *email, userID)

	today := time.Now().UTC()
	var lastCompileLines []string

	for i := *days - 1; i >= 0; i-- {
		date := today.AddDate(0, 0, -i)
		dateStr := date.Format("2006-01-02")

		clearDate(ctx, pool, userID, dateStr)
		seedDate(ctx, queries, userID, dateStr, i)

		compileLines, err := analyst.RunForUserOnDate(ctx, userID, dateStr)
		if err != nil {
			log.Fatalf("analyst failed for %s: %v", dateStr, err)
		}
		lastCompileLines = compileLines

		profile, _ := queries.GetShadowProfile(ctx, userID)
		fmt.Printf("  %s  compile #%-3d  archetype=%-22s  acc=%d\n",
			dateStr,
			profile.CompileCount,
			profile.PrimaryArchetype,
			profile.DaemonAccuracy,
		)
	}

	// Run Narrator for today so daemon_prose + compile_log_lines land in DynamoDB
	// and the Home screen shows a real result after devrun completes.
	if !*skipNarrator {
		fmt.Printf("\n  running narrator (calls Anthropic + Polly)...\n")
		narrator := ai.NewNarrator(cfg, queries, dynamo.NewClient(cfg))
		detailJSON, _ := json.Marshal(map[string]interface{}{
			"user_id":       userID.String(),
			"compile_lines": lastCompileLines,
		})
		if err := narrator.Run(ctx, events.EventBridgeEvent{Detail: json.RawMessage(detailJSON)}); err != nil {
			fmt.Printf("  narrator error (non-fatal): %v\n", err)
		} else {
			fmt.Printf("  ✓ daemon prose written\n")
		}
	}

	// Print final state
	profile, _ := queries.GetShadowProfile(ctx, userID)
	fmt.Printf("\n── final profile ──────────────────────────────────────────\n")
	fmt.Printf("  archetype:       %s\n", profile.PrimaryArchetype)
	fmt.Printf("  compile_count:   %d\n", profile.CompileCount)
	fmt.Printf("  daemon_accuracy: %d\n", profile.DaemonAccuracy)
	fmt.Printf("  kernel_access:   %d\n", profile.KernelAccess)
	fmt.Printf("  stage:           %s\n", profile.Stage)

	if len(lastCompileLines) > 0 {
		fmt.Printf("\n── compile log lines ──────────────────────────────────────\n")
		for _, line := range lastCompileLines {
			fmt.Printf("  %s\n", line)
		}
	}

	fmt.Printf("\nopen the app → /home to see the full result\n")
}

// clearDate removes any existing card_responses and mood_logs for a date so
// devrun is idempotent when run multiple times against the same account.
func clearDate(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, dateStr string) {
	date := pgDate(dateStr)
	pool.Exec(ctx, //nolint:errcheck
		"DELETE FROM card_responses WHERE user_id = $1 AND session_date = $2",
		userID, date)
	pool.Exec(ctx, //nolint:errcheck
		"DELETE FROM mood_logs WHERE user_id = $1 AND log_date = $2",
		userID, date)
}

// seedDate inserts one realistic fake session for dateStr.
// dayOffset is used to seed the PRNG so different days produce different signals.
func seedDate(ctx context.Context, queries *db.Queries, userID uuid.UUID, dateStr string, dayOffset int) {
	rng := rand.New(rand.NewSource(int64(userID[0])<<24 | int64(userID[1])<<16 | int64(dayOffset))) //nolint:gosec
	date := pgDate(dateStr)

	// ── reaction_test ─────────────────────────────────────────────────────────
	// Show all devWords, tap a varied subset so approach/avoidance signal changes
	// across days.
	tapCount := 5 + rng.Intn(4) // 5–8 taps
	perm := rng.Perm(len(devWords))
	taps := make([]rtTap, 0, tapCount)
	for j := 0; j < tapCount && j < len(perm); j++ {
		w := devWords[perm[j]]
		if _, ok := signal.Lookup(w); ok {
			taps = append(taps, rtTap{
				Word:           w,
				ReactionTimeMs: 140 + rng.Intn(320),
			})
		}
	}
	rtData, _ := json.Marshal(rtPayload{Tapped: taps, Total: len(devWords)})
	_ = queries.InsertCardResponse(ctx, db.InsertCardResponseParams{
		UserID:       userID,
		FragmentID:   fmt.Sprintf("dev-rt-%s", dateStr),
		FragmentType: "reaction_test",
		ResponseData: rtData,
		SessionDate:  date,
	})

	// ── weighted_scale ────────────────────────────────────────────────────────
	// Use the first 3 pairs that are always eligible (IntroducedAfterDay=0).
	var eligiblePairs []signal.Pair
	for _, p := range signal.Pairs {
		if p.IntroducedAfterDay == 0 {
			eligiblePairs = append(eligiblePairs, p)
		}
		if len(eligiblePairs) == 3 {
			break
		}
	}
	results := make([]wsItem, 0, len(eligiblePairs))
	for _, p := range eligiblePairs {
		// Vary the value so dimensions get different signals each day
		val := (rng.Float64()*2 - 1) * 0.8 // -0.8..+0.8
		results = append(results, wsItem{
			Left:               p.Left,
			Right:              p.Right,
			Value:              val,
			DeliberationTimeMs: 700 + rng.Intn(2200),
		})
	}
	wsData, _ := json.Marshal(results)
	_ = queries.InsertCardResponse(ctx, db.InsertCardResponseParams{
		UserID:       userID,
		FragmentID:   fmt.Sprintf("dev-ws-%s", dateStr),
		FragmentType: "weighted_scale",
		ResponseData: wsData,
		SessionDate:  date,
	})

	// ── prediction_duel ───────────────────────────────────────────────────────
	duelData, _ := json.Marshal(duelPayload{
		Matched:            rng.Intn(10) < 6, // 60 % match rate
		DuelResponseTimeMs: 600 + rng.Intn(1800),
	})
	_ = queries.InsertCardResponse(ctx, db.InsertCardResponseParams{
		UserID:       userID,
		FragmentID:   fmt.Sprintf("dev-duel-%s", dateStr),
		FragmentType: "prediction_duel",
		ResponseData: duelData,
		SessionDate:  date,
	})

	// ── mood_log ─────────────────────────────────────────────────────────────
	_ = queries.InsertMoodLog(ctx, db.InsertMoodLogParams{
		UserID:    userID,
		MoodScore: int32(4 + rng.Intn(4)), // 4–7
		Note:      pgtype.Text{},
		LogDate:   date,
	})
}

// pgDate converts a "2006-01-02" string to pgtype.Date.
func pgDate(dateStr string) pgtype.Date {
	t, _ := time.Parse("2006-01-02", dateStr)
	return pgtype.Date{Time: t, Valid: true}
}
