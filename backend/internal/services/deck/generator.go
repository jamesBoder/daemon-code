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
	"github.com/jamesboder/daemon-code/internal/signal"
)

const (
	reactionWordDurationMs = 800 // ms words are displayed in the ReactionTest; must match frontend default
	scalesMin              = 2   // fewest weighted scale fragments per deck
	scalesMax              = 3   // most weighted scale fragments per deck
	middleOrderAttempts    = 8   // shuffle retries to find a middle with no same-type neighbors
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

	// The deck read here is the one that served the day now ending (GetDailyDeck
	// keys on the current UTC date; the nightly run stamps tomorrow's). Used to
	// keep tonight's content from repeating yesterday's. Best-effort: a missing
	// or unreadable previous deck just means no exclusions.
	prevDeck, err := g.ddb.GetDailyDeck(ctx, userID.String())
	if err != nil {
		prevDeck = nil
	}

	fragments := g.buildDeck(profile, patterns, usedPairIDs(prevDeck))
	// Stamp with the date this deck serves (the following UTC day for the
	// 23:00 UTC nightly run) so GetDailyDeck finds it throughout that day.
	date := dynamo.ServiceDate(time.Now())

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

// buildDeck produces the next day's fragment queue using a fixed pacing arc
// with randomized composition and order:
//
//	opener — a fast, low-friction game (one of the two reaction tests, random which)
//	middle — the other reaction test + 2–3 weighted scales, shuffled so no two
//	         same-type fragments sit adjacent (including against the opener)
//	closer — the prediction duel when patterns exist (the stakes beat stays last)
//
// Variety comes from composition and content sampling; the arc itself is constant.
func (g *Generator) buildDeck(profile db.ShadowProfile, patterns []db.PatternLibrary, excludePairs map[string]bool) []dynamo.Fragment {
	opener := g.buildReactionTest(profile)
	second := g.buildReactionTestExplore(profile)
	if rand.Intn(2) == 0 {
		opener, second = second, opener
	}

	nScales := scalesMin + rand.Intn(scalesMax-scalesMin+1)
	middle := []dynamo.Fragment{second}
	for _, pair := range pickScalePairs(nScales, profile.CompileCount, excludePairs) {
		middle = append(middle, buildWeightedScaleFragment(pair))
	}
	middle = shuffleNoAdjacent(middle, opener.Type)

	deck := append([]dynamo.Fragment{opener}, middle...)
	if len(patterns) > 0 {
		deck = append(deck, g.buildPredictionDuel(profile, patterns))
	}

	for i := range deck {
		deck[i].Order = i
	}
	return deck
}

// shuffleNoAdjacent shuffles fragments, retrying up to middleOrderAttempts times
// for an order where no two consecutive fragments share a type (treating prevType
// as sitting immediately before the slice). Some compositions have no valid order
// (e.g. 3 scales against 1 reaction test), so it keeps the least-violating attempt.
func shuffleNoAdjacent(fragments []dynamo.Fragment, prevType string) []dynamo.Fragment {
	best := make([]dynamo.Fragment, len(fragments))
	copy(best, fragments)
	bestViolations := adjacencyViolations(best, prevType)

	for attempt := 0; attempt < middleOrderAttempts && bestViolations > 0; attempt++ {
		rand.Shuffle(len(fragments), func(i, j int) { fragments[i], fragments[j] = fragments[j], fragments[i] })
		if v := adjacencyViolations(fragments, prevType); v < bestViolations {
			copy(best, fragments)
			bestViolations = v
		}
	}
	return best
}

func adjacencyViolations(fragments []dynamo.Fragment, prevType string) int {
	violations := 0
	last := prevType
	for _, f := range fragments {
		if f.Type == last {
			violations++
		}
		last = f.Type
	}
	return violations
}

// usedPairIDs collects the weighted-scale pair IDs served by the previous deck
// so pickScalePairs can exclude them. Payloads written before pair IDs were
// stamped simply contribute nothing.
func usedPairIDs(prev *dynamo.DailyDeck) map[string]bool {
	ids := make(map[string]bool)
	if prev == nil {
		return ids
	}
	for _, f := range prev.Fragments {
		if f.Type != "weighted_scale" {
			continue
		}
		var p struct {
			PairID string `json:"pair_id"`
		}
		if json.Unmarshal([]byte(f.Payload), &p) == nil && p.PairID != "" {
			ids[p.PairID] = true
		}
	}
	return ids
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
		"duration_ms":    reactionWordDurationMs,
		"archetype_hint": archetype,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "reaction_test",
		Payload:    string(payload),
		DaemonNote: "Observe what moves quickly.",
	}
}

// buildReactionTestExplore uses a broader word set to surface signals beyond the primary archetype.
func (g *Generator) buildReactionTestExplore(profile db.ShadowProfile) dynamo.Fragment {
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
	}
}

// pickScalePairs selects n random weighted-scale pairs eligible for this user's compile count.
// Pairs with IntroducedAfterDay > compileCount are excluded — they require more session history
// before the behavioral signal they probe is meaningful. Pairs in exclude (served yesterday)
// are held back unless the eligible pool is too small without them — early-day users with
// tiny pools get repeats rather than short decks.
// signal.Pairs is the single source of truth for pair text and dimension tags.
func pickScalePairs(n int, compileCount int32, exclude map[string]bool) []signal.Pair {
	var pool, served []signal.Pair
	for _, p := range signal.Pairs {
		switch {
		case p.IntroducedAfterDay > int(compileCount):
		case exclude[p.PairID]:
			served = append(served, p)
		default:
			pool = append(pool, p)
		}
	}
	rand.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
	if len(pool) < n {
		rand.Shuffle(len(served), func(i, j int) { served[i], served[j] = served[j], served[i] })
		pool = append(pool, served...)
	}
	if n > len(pool) {
		n = len(pool)
	}
	return pool[:n]
}

func buildWeightedScaleFragment(pair signal.Pair) dynamo.Fragment {
	payload, _ := json.Marshal(map[string]interface{}{
		"left":    pair.Left,
		"right":   pair.Right,
		"pair_id": pair.PairID, // read back tomorrow night for anti-repeat; frontend ignores it
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "weighted_scale",
		Payload:    string(payload),
		DaemonNote: "The weight reveals the lean.",
	}
}

func (g *Generator) buildPredictionDuel(profile db.ShadowProfile, patterns []db.PatternLibrary) dynamo.Fragment {
	patternName := "unknown_pattern"
	if picked := pickPatternWeighted(patterns); picked.Name.Valid {
		patternName = picked.Name.String
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
	}
}

// pickPatternWeighted selects a named pattern with probability proportional to
// strength, so the strongest pattern leads most nights but the duel doesn't ask
// about the same pattern every single day. Returns the zero value when no named
// pattern with positive strength exists.
func pickPatternWeighted(patterns []db.PatternLibrary) db.PatternLibrary {
	var named []db.PatternLibrary
	total := 0
	for _, p := range patterns {
		if p.Name.Valid && p.Strength > 0 {
			named = append(named, p)
			total += int(p.Strength)
		}
	}
	if len(named) == 0 {
		return db.PatternLibrary{}
	}
	roll := rand.Intn(total)
	for _, p := range named {
		roll -= int(p.Strength)
		if roll < 0 {
			return p
		}
	}
	return named[len(named)-1]
}
