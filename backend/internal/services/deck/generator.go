package deck

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
)

type Generator struct {
	cfg *appconfig.Config
	ddb *dynamo.Client
	q   *db.Queries
}

func NewGenerator(cfg *appconfig.Config, ddb *dynamo.Client, q *db.Queries) *Generator {
	return &Generator{cfg: cfg, ddb: ddb, q: q}
}

func (g *Generator) Run(ctx context.Context, event events.EventBridgeEvent) error {
	var detail struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(event.Detail), &detail); err != nil {
		return fmt.Errorf("parse event detail: %w", err)
	}

	userID, err := uuid.Parse(detail.UserID)
	if err != nil {
		return fmt.Errorf("parse user_id: %w", err)
	}

	profile, err := g.q.GetShadowProfile(ctx, userID)
	if err != nil {
		return fmt.Errorf("get shadow profile: %w", err)
	}

	patterns, err := g.q.GetPatternLibrary(ctx, userID)
	if err != nil {
		return fmt.Errorf("get pattern library: %w", err)
	}

	fragments := g.buildDeck(profile, patterns)
	date := time.Now().UTC().Format("2006-01-02")

	if err := g.ddb.PutDailyDeck(ctx, dynamo.DailyDeck{
		UserID:    userID.String(),
		Date:      date,
		Fragments: fragments,
		TTL:       time.Now().Add(48 * time.Hour).Unix(),
	}); err != nil {
		return fmt.Errorf("put daily deck: %w", err)
	}

	return nil
}

// buildDeck produces the next day's fragment queue.
// Prototype: rule-based selection. Phase 4: replace with AI-driven SignalSelector.
func (g *Generator) buildDeck(profile db.ShadowProfile, patterns []db.PatternLibrary) []dynamo.Fragment {
	var fragments []dynamo.Fragment

	fragments = append(fragments, g.buildReactionTest(profile))
	fragments = append(fragments, g.buildWeightedScale(profile))
	if len(patterns) > 0 {
		fragments = append(fragments, g.buildPredictionDuel(profile, patterns))
	}

	return fragments
}

func (g *Generator) buildReactionTest(profile db.ShadowProfile) dynamo.Fragment {
	wordSets := map[string][]string{
		"abandoned_child": {"safety", "rejection", "belonging", "distance", "warmth", "abandonment"},
		"unworthy_self":   {"achievement", "failure", "worth", "inadequacy", "success", "shame"},
		"caged_rage":      {"control", "freedom", "power", "constraint", "authority", "resistance"},
		"grief_carrier":   {"loss", "memory", "absence", "presence", "grief", "continuity"},
		"default":         {"safety", "achievement", "control", "loss", "belonging", "freedom"},
	}

	archetype := profile.PrimaryArchetype
	words, ok := wordSets[archetype]
	if !ok {
		words = wordSets["default"]
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"words":          words,
		"duration_ms":    200,
		"archetype_hint": archetype,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "reaction_test",
		Payload:    string(payload),
		DaemonNote: "Observe what moves quickly.",
		Order:      0,
	}
}

func (g *Generator) buildWeightedScale(profile db.ShadowProfile) dynamo.Fragment {
	pairs := map[string][2]string{
		"neutral": {"certainty", "uncertainty"},
		"water":   {"stillness", "movement"},
		"fire":    {"intensity", "calm"},
	}

	env := profile.Environment
	pair, ok := pairs[env]
	if !ok {
		pair = pairs["neutral"]
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"left":  pair[0],
		"right": pair[1],
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "weighted_scale",
		Payload:    string(payload),
		DaemonNote: "The weight reveals the lean.",
		Order:      1,
	}
}

func (g *Generator) buildPredictionDuel(profile db.ShadowProfile, patterns []db.PatternLibrary) dynamo.Fragment {
	// Use the strongest named pattern for the prediction duel.
	var strongest db.PatternLibrary
	for _, p := range patterns {
		if p.Name.Valid && p.Strength > strongest.Strength {
			strongest = p
		}
	}

	patternName := "unknown_pattern"
	if strongest.Name.Valid {
		patternName = strongest.Name.String
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"pattern":    patternName,
		"prediction": fmt.Sprintf("You will notice %s today.", patternName),
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "prediction_duel",
		Payload:    string(payload),
		DaemonNote: "The daemon made a prediction. Was it right?",
		Order:      2,
	}
}
