package deck

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
)

const (
	reactionWordDurationMs = 800 // ms words are displayed in the ReactionTest; must match frontend default
	scalesPerSession       = 2   // weighted scale fragments generated per deck
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
// Generates 5 fragments: 2 reaction tests, 2 weighted scales, 1 prediction duel (if patterns exist).
func (g *Generator) buildDeck(profile db.ShadowProfile, patterns []db.PatternLibrary) []dynamo.Fragment {
	var fragments []dynamo.Fragment

	fragments = append(fragments, g.buildReactionTest(profile, 0))
	fragments = append(fragments, g.buildReactionTestExplore(profile, 1))

	pairs := pickScalePairs(scalesPerSession)
	for i, pair := range pairs {
		fragments = append(fragments, buildWeightedScaleFragment(pair[0], pair[1], 2+i))
	}

	if len(patterns) > 0 {
		fragments = append(fragments, g.buildPredictionDuel(profile, patterns, len(fragments)))
	}

	return fragments
}

func (g *Generator) buildReactionTest(profile db.ShadowProfile, order int) dynamo.Fragment {
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
		"duration_ms":    reactionWordDurationMs,
		"archetype_hint": archetype,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "reaction_test",
		Payload:    string(payload),
		DaemonNote: "Observe what moves quickly.",
		Order:      order,
	}
}

// buildReactionTestExplore uses a broader word set to surface signals beyond the primary archetype.
func (g *Generator) buildReactionTestExplore(profile db.ShadowProfile, order int) dynamo.Fragment {
	exploreSets := map[string][]string{
		"abandoned_child": {"purpose", "visibility", "silence", "voice", "loyalty", "trust"},
		"unworthy_self":   {"approval", "identity", "boundaries", "effort", "rest", "pride"},
		"caged_rage":      {"surrender", "clarity", "change", "stability", "truth", "anger"},
		"grief_carrier":   {"joy", "comfort", "risk", "certainty", "doubt", "connection"},
		"default":         {"purpose", "approval", "surrender", "joy", "clarity", "identity"},
	}

	archetype := profile.PrimaryArchetype
	words, ok := exploreSets[archetype]
	if !ok {
		words = exploreSets["default"]
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"words":          words,
		"duration_ms":    reactionWordDurationMs,
		"archetype_hint": archetype,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "reaction_test",
		Payload:    string(payload),
		DaemonNote: "The second pass catches what the first one missed.",
		Order:      order,
	}
}

// evergreen scale pairs — evergreen behavioral/abstract pairs where neither side signals "correct."
// From the Jeopardy Principle: both sides must have genuine pull.
var evergreenPairs = [][2]string{
	{"arriving 10 minutes early", "arriving exactly on time"},
	{"winning the argument", "ending it"},
	{"what you built", "how you made people feel"},
	{"the apology you gave", "the apology you're owed"},
	{"a clean slate", "everything you've built"},
	{"the city you're from", "the city you chose"},
	{"the 5-year plan", "the feeling in your gut"},
	{"ending a great book", "starting a new one"},
	{"the advice you gave", "the advice you followed"},
	{"speaking first", "listening first"},
	{"being right", "being at peace"},
	{"the version of you people remember", "the version you remember"},
}

func pickScalePairs(n int) [][2]string {
	pool := make([][2]string, len(evergreenPairs))
	copy(pool, evergreenPairs)
	rand.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
	if n > len(pool) {
		n = len(pool)
	}
	return pool[:n]
}

func buildWeightedScaleFragment(left, right string, order int) dynamo.Fragment {
	payload, _ := json.Marshal(map[string]interface{}{
		"left":  left,
		"right": right,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "weighted_scale",
		Payload:    string(payload),
		DaemonNote: "The weight reveals the lean.",
		Order:      order,
	}
}

func (g *Generator) buildPredictionDuel(profile db.ShadowProfile, patterns []db.PatternLibrary, order int) dynamo.Fragment {
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
		Order:      order,
	}
}
