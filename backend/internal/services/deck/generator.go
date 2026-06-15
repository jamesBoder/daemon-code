package deck

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
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
	speedPromptsPerRound   = 4   // prompts sampled into one speed_round fragment
	speedRoundMinCompiles  = 1   // compiles before speed rounds enter the deck rotation
	wordsPerTest           = 6   // words sampled into one reaction_test fragment
)

// exclusions holds content IDs served by the previous deck, kept out of
// tonight's sampling so consecutive sessions don't repeat.
type exclusions struct {
	pairIDs        map[string]bool
	speedPromptIDs map[string]bool
	reactionWords  map[string]bool
}

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

	// Analyst-authored duel prediction from tonight's compile (runs before the
	// deck generator in the nightly chain). Zero value on error → template fallback.
	pred, err := g.q.GetTomorrowPrediction(ctx, userID)
	if err != nil {
		pred = db.TomorrowPrediction{}
	}

	fragments := g.buildDeck(profile, patterns, usedContentIDs(prevDeck), pred)
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
//	opener — a fast, low-friction game (random among tonight's fast picks)
//	middle — the remaining fast game + 2–3 weighted scales, shuffled so no two
//	         same-type fragments sit adjacent (including against the opener)
//	closer — the prediction duel when patterns exist (the stakes beat stays last)
//
// Variety comes from composition and content sampling; the arc itself is constant.
//
// Adding a game: put its tagged content in internal/signal, write a build
// function here, slot it into pickFastGames (fast games) or the middle/closer
// assembly below, register its renderer in the frontend fragment registry, and
// teach computeDimensionSignals (internal/services/ai/context.go) its
// response_data shape.
func (g *Generator) buildDeck(profile db.ShadowProfile, patterns []db.PatternLibrary, exclude exclusions, pred db.TomorrowPrediction) []dynamo.Fragment {
	fast := g.pickFastGames(profile, exclude)
	opener, second := fast[0], fast[1]

	nScales := scalesMin + rand.Intn(scalesMax-scalesMin+1) // #nosec G404 — non-crypto deck composition
	middle := []dynamo.Fragment{second}
	for _, pair := range pickScalePairs(nScales, profile.CompileCount, exclude.pairIDs) {
		middle = append(middle, buildWeightedScaleFragment(pair))
	}
	middle = arrangeNoAdjacent(middle, opener.Type)

	deck := append([]dynamo.Fragment{opener}, middle...)
	if len(patterns) > 0 {
		deck = append(deck, g.buildPredictionDuel(profile, patterns, pred))
	}

	for i := range deck {
		deck[i].Order = i
	}
	return deck
}

// pickFastGames selects tonight's two fast fragments. One reaction test always
// plays (its taps drive the word-based dimension signals and session-quality
// timing, so no night goes without them); the second slot is a coin flip
// between the other reaction word set and a speed round once the user has
// enough compiles. Which of the two opens is also random.
func (g *Generator) pickFastGames(profile db.ShadowProfile, exclude exclusions) [2]dynamo.Fragment {
	reaction := g.buildReactionTest(profile, exclude)
	other := g.buildReactionTestExplore(profile, exclude)
	if rand.Intn(2) == 0 { // #nosec G404 — non-crypto fragment ordering
		reaction, other = other, reaction
	}

	second := other
	if int(profile.CompileCount) >= speedRoundMinCompiles && rand.Intn(2) == 0 { // #nosec G404 — non-crypto game selection
		if sr, ok := buildSpeedRound(profile.CompileCount, exclude.speedPromptIDs); ok {
			second = sr
		}
	}

	if rand.Intn(2) == 0 { // #nosec G404 — non-crypto fragment ordering
		return [2]dynamo.Fragment{reaction, second}
	}
	return [2]dynamo.Fragment{second, reaction}
}

// arrangeNoAdjacent orders fragments randomly so that no two consecutive
// fragments share a type, treating prevType as sitting immediately before the
// slice. Greedy most-remaining-type-first (the reorganize-string algorithm)
// guarantees a violation-free order whenever one exists; randomized tie-breaks
// and per-type shuffles keep the order varied night to night. When no valid
// order exists (e.g. 3 scales against 1 fast game) violations are minimal.
func arrangeNoAdjacent(fragments []dynamo.Fragment, prevType string) []dynamo.Fragment {
	byType := make(map[string][]dynamo.Fragment)
	for _, f := range fragments {
		byType[f.Type] = append(byType[f.Type], f)
	}
	for _, group := range byType {
		rand.Shuffle(len(group), func(i, j int) { group[i], group[j] = group[j], group[i] })
	}

	out := make([]dynamo.Fragment, 0, len(fragments))
	last := prevType
	for len(out) < len(fragments) {
		pick, pickCount := "", -1
		for t, group := range byType {
			if t == last || len(group) == 0 {
				continue
			}
			if len(group) > pickCount || (len(group) == pickCount && rand.Intn(2) == 0) { // #nosec G404 — non-crypto tie-break
				pick, pickCount = t, len(group)
			}
		}
		if pick == "" {
			// Only the previous type remains — adjacency is unavoidable here.
			for t, group := range byType {
				if len(group) > 0 {
					pick = t
					break
				}
			}
		}
		out = append(out, byType[pick][0])
		byType[pick] = byType[pick][1:]
		last = pick
	}
	return out
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

// usedContentIDs collects the content IDs served by the previous deck so
// sampling can exclude them. Payloads written before IDs were stamped simply
// contribute nothing.
func usedContentIDs(prev *dynamo.DailyDeck) exclusions {
	ex := exclusions{
		pairIDs:        make(map[string]bool),
		speedPromptIDs: make(map[string]bool),
		reactionWords:  make(map[string]bool),
	}
	if prev == nil {
		return ex
	}
	for _, f := range prev.Fragments {
		switch f.Type {
		case "reaction_test":
			var p struct {
				Words []string `json:"words"`
			}
			if json.Unmarshal([]byte(f.Payload), &p) == nil {
				for _, w := range p.Words {
					ex.reactionWords[w] = true
				}
			}
		case "weighted_scale":
			var p struct {
				PairID string `json:"pair_id"`
			}
			if json.Unmarshal([]byte(f.Payload), &p) == nil && p.PairID != "" {
				ex.pairIDs[p.PairID] = true
			}
		case "speed_round":
			var p struct {
				PromptIDs []string `json:"prompt_ids"`
			}
			if json.Unmarshal([]byte(f.Payload), &p) == nil {
				for _, id := range p.PromptIDs {
					ex.speedPromptIDs[id] = true
				}
			}
		}
	}
	return ex
}

// buildSpeedRound samples speedPromptsPerRound prompts eligible for this user's
// compile count, holding back prompts served yesterday unless the pool runs
// short. Returns ok=false when no prompts are eligible at all.
// The payload's prompts array matches the frontend SpeedRoundPrompt shape;
// prompt_ids is read back tomorrow night for anti-repeat.
func buildSpeedRound(compileCount int32, exclude map[string]bool) (dynamo.Fragment, bool) {
	var pool, served []signal.SpeedPrompt
	for _, p := range signal.SpeedPrompts {
		switch {
		case p.IntroducedAfterDay > int(compileCount):
		case exclude[p.PromptID]:
			served = append(served, p)
		default:
			pool = append(pool, p)
		}
	}
	rand.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
	if len(pool) < speedPromptsPerRound {
		rand.Shuffle(len(served), func(i, j int) { served[i], served[j] = served[j], served[i] })
		pool = append(pool, served...)
	}
	if len(pool) == 0 {
		return dynamo.Fragment{}, false
	}
	n := speedPromptsPerRound
	if n > len(pool) {
		n = len(pool)
	}

	prompts := make([]map[string]interface{}, 0, n)
	promptIDs := make([]string, 0, n)
	for _, p := range pool[:n] {
		options := make([]string, len(p.Options))
		for i, o := range p.Options {
			options[i] = o.Text
		}
		prompts = append(prompts, map[string]interface{}{"starter": p.Starter, "options": options})
		promptIDs = append(promptIDs, p.PromptID)
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"prompts":    prompts,
		"prompt_ids": promptIDs,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "speed_round",
		Payload:    string(payload),
		DaemonNote: "First answers carry the least editing.",
	}, true
}

// buildReactionTest samples the primary nightly word set from the archetype's
// core pool in signal.Words — the words that probe the archetype directly.
func (g *Generator) buildReactionTest(profile db.ShadowProfile, exclude exclusions) dynamo.Fragment {
	words := sampleWords(signal.CoreWords(profile.PrimaryArchetype), wordsPerTest, exclude.reactionWords)
	return reactionTestFragment(words, profile.PrimaryArchetype, "Observe what moves quickly.")
}

// buildReactionTestExplore samples from the rest of the library to surface
// signals beyond the primary archetype. Its pool is disjoint from the primary
// test's, so the two never overlap within one deck.
func (g *Generator) buildReactionTestExplore(profile db.ShadowProfile, exclude exclusions) dynamo.Fragment {
	words := sampleWords(signal.ExploreWords(profile.PrimaryArchetype), wordsPerTest, exclude.reactionWords)
	return reactionTestFragment(words, profile.PrimaryArchetype, "The second pass catches what the first one missed.")
}

// sampleWords picks n random word texts from pool, holding back words served
// yesterday unless the pool runs short without them.
func sampleWords(pool []signal.Word, n int, exclude map[string]bool) []string {
	var fresh, served []string
	for _, w := range pool {
		if exclude[w.Text] {
			served = append(served, w.Text)
		} else {
			fresh = append(fresh, w.Text)
		}
	}
	rand.Shuffle(len(fresh), func(i, j int) { fresh[i], fresh[j] = fresh[j], fresh[i] })
	if len(fresh) < n {
		rand.Shuffle(len(served), func(i, j int) { served[i], served[j] = served[j], served[i] })
		fresh = append(fresh, served...)
	}
	if n > len(fresh) {
		n = len(fresh)
	}
	return fresh[:n]
}

func reactionTestFragment(words []string, archetype, daemonNote string) dynamo.Fragment {
	payload, _ := json.Marshal(map[string]interface{}{
		"words":          words,
		"duration_ms":    reactionWordDurationMs,
		"archetype_hint": archetype,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "reaction_test",
		Payload:    string(payload),
		DaemonNote: daemonNote,
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

// buildPredictionDuel serves the Analyst-authored prediction when one was
// written tonight, falling back to a humanized template otherwise. The
// daemon_record stamped here is current all day: the Analyst (which moves
// daemon_accuracy) runs before the deck generator in the nightly chain.
func (g *Generator) buildPredictionDuel(profile db.ShadowProfile, patterns []db.PatternLibrary, pred db.TomorrowPrediction) dynamo.Fragment {
	patternName := "unknown_pattern"
	if picked := pickPatternWeighted(patterns); picked.Name.Valid {
		patternName = picked.Name.String
	}

	prediction := fmt.Sprintf("You will notice %s today.", humanizePatternName(patternName))
	if pred.Text != "" {
		prediction = pred.Text
		if pred.PatternName != "" {
			patternName = pred.PatternName
		}
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"pattern":       patternName,
		"prediction":    prediction,
		"daemon_record": profile.DaemonAccuracy,
	})

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "prediction_duel",
		Payload:    string(payload),
		DaemonNote: "The daemon made a prediction. Was it right?",
	}
}

// humanizePatternName turns an internal pattern name into duel-readable text:
// "the_approval_loop.process" → "the approval loop". The internal form never
// reaches the user.
func humanizePatternName(name string) string {
	if name == "unknown_pattern" {
		return "a familiar pattern"
	}
	name = strings.TrimSuffix(name, ".process")
	return strings.ReplaceAll(name, "_", " ")
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
	roll := rand.Intn(total) // #nosec G404 — non-crypto weighted pattern pick
	for _, p := range named {
		roll -= int(p.Strength)
		if roll < 0 {
			return p
		}
	}
	return named[len(named)-1]
}
