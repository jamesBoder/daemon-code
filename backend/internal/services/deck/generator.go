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

	trapMinCompiles = 14 // compiles before The Trap can enter the deck (enough baseline)
	trapStakeMin    = 8  // floor for the personalized stake pot (so a loss still bites)
	trapStakeMax    = 24 // ceiling (so the numbers stay legible for veteran users)

	// Overconfidence trap — a pre-session estimate the daemon resolves against
	// what the user actually completes. Unlocks later than the choice-traps so the
	// user has a felt sense of session length (otherwise the estimate is ignorance,
	// not optimism). On a trap night it's chosen 1-in-3 over a choice-trap.
	trapOverconfidenceMinCompiles = 21
	overconfidenceSliderMax       = 12 // slider runs 1..max; well above the ~5–6 a deck actually holds

	// The Hold — the one fragment with no task or content: a void that reads
	// patience vs. the compulsion to act. Content-free, so it can unlock earlier
	// than the Trap, but it stays occasional (the daemon earns the right to ask
	// for nothing) and never shares a night with a trap. On an eligible night it
	// replaces one scale so the deck length holds.
	holdMinCompiles  = 7
	holdOdds         = 4   // 1-in-this chance on an eligible (non-trap) night
	holdIntimacyFull = 30  // compiles at which the daemon settles a familiar user fully (intimacy = 1)
	holdNeutralScore = 0.5 // dimension fallback before the model has a read (Day 0)
)

// exclusions holds content IDs served by the previous deck, kept out of
// tonight's sampling so consecutive sessions don't repeat.
type exclusions struct {
	pairIDs        map[string]bool
	speedPromptIDs map[string]bool
	reactionWords  map[string]bool
	trapIDs        map[string]bool
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

	// The Trap — the one fragment with a right answer. Included probabilistically
	// past the unlock so it isn't every night, and never stacking two stakes beats
	// against the closing duel. On a trap night run exactly one trap: usually a
	// choice-trap in the middle (replacing one scale, length holds 5–6, duel stays
	// the closer), occasionally — once the user knows session length — an
	// overconfidence estimate up front. The two are mutually exclusive.
	var trap *dynamo.Fragment                                              // choice-trap (odds/sunk), goes in the middle
	var overconf *dynamo.Fragment                                          // overconfidence estimate, goes first
	if int(profile.CompileCount) >= trapMinCompiles && rand.Intn(2) == 0 { // #nosec G404 — non-crypto game selection
		if int(profile.CompileCount) >= trapOverconfidenceMinCompiles && rand.Intn(3) == 0 { // #nosec G404 — non-crypto game selection
			oc := buildOverconfidenceTrap()
			overconf = &oc
		} else if tf, ok := buildTrap(profile, exclude.trapIDs); ok {
			trap = &tf
			if nScales > 1 {
				nScales--
			}
		}
	}

	// The Hold — a contemplative empty beat. Only on a night with no trap (the two
	// are tonally opposite and shouldn't crowd one session), occasional past its
	// unlock, and it replaces one scale so the deck length holds.
	var hold *dynamo.Fragment
	if trap == nil && overconf == nil && int(profile.CompileCount) >= holdMinCompiles && rand.Intn(holdOdds) == 0 { // #nosec G404 — non-crypto game selection
		hf := buildHold(profile)
		hold = &hf
		if nScales > 1 {
			nScales--
		}
	}

	middle := []dynamo.Fragment{second}
	for _, pair := range pickScalePairs(nScales, profile.CompileCount, exclude.pairIDs) {
		middle = append(middle, buildWeightedScaleFragment(pair))
	}
	if trap != nil {
		middle = append(middle, *trap)
	}
	if hold != nil {
		middle = append(middle, *hold)
	}
	middle = arrangeNoAdjacent(middle, opener.Type)

	// The overconfidence estimate must precede every game so the prediction is made
	// uninformed by this session's play.
	deck := []dynamo.Fragment{}
	if overconf != nil {
		deck = append(deck, *overconf)
	}
	deck = append(deck, opener)
	deck = append(deck, middle...)
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
		trapIDs:        make(map[string]bool),
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
		case "trap":
			var p struct {
				TrapID string `json:"trap_id"`
			}
			if json.Unmarshal([]byte(f.Payload), &p) == nil && p.TrapID != "" {
				ex.trapIDs[p.TrapID] = true
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

// buildTrap selects one eligible trap (held back from yesterday's unless it's
// the only one left), personalizes the stake from the user's decoded count, and
// stamps a render-ready payload. The dimension tags and which option is the bait
// stay server-side — the client gets only labels and numbers, and the "right"
// answer is computable from those numbers by design. Returns ok=false when no
// trap is eligible for this compile count.
func buildTrap(profile db.ShadowProfile, exclude map[string]bool) (dynamo.Fragment, bool) {
	var fresh, served []signal.Trap
	for _, t := range signal.Traps {
		switch {
		case t.IntroducedAfterDay > int(profile.CompileCount):
		case exclude[t.TrapID]:
			served = append(served, t)
		default:
			fresh = append(fresh, t)
		}
	}
	pool := fresh
	if len(pool) == 0 {
		pool = served // every eligible trap played yesterday — repeat rather than skip
	}
	if len(pool) == 0 {
		return dynamo.Fragment{}, false
	}
	t := pool[rand.Intn(len(pool))] // #nosec G404 — non-crypto content selection

	base := clampStake(profile.FragmentsDecoded)
	payload := buildTrapPayload(t, base)

	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "trap",
		Payload:    payload,
		DaemonNote: "One move is better than the other. The daemon already knows which.",
	}, true
}

// buildOverconfidenceTrap generates the pre-session estimate fragment. It carries
// no content library — it's a single recurring mechanic. The daemon resolves the
// estimate nightly against how many fragments the user actually completed; chronic
// over-estimation earns a process. trap_id "overconfidence_estimate" is not in the
// Traps library on purpose, so LookupTrap misses it and the bias-alignment and
// dimension-fold paths skip it — it is scored only by computeOverconfidenceSignal.
func buildOverconfidenceTrap() dynamo.Fragment {
	payload, _ := json.Marshal(map[string]interface{}{
		"type":     "trap",
		"trap_id":  "overconfidence_estimate",
		"kind":     "overconfidence",
		"scenario": "Before you begin — how far will you get today?",
		"max":      overconfidenceSliderMax,
	})
	return dynamo.Fragment{
		ID:         uuid.New().String(),
		Type:       "trap",
		Payload:    string(payload),
		DaemonNote: "The daemon will compare this to what you actually do.",
	}
}

// buildHold stamps The Hold — the one fragment with no task and no content. The
// void is personalized so it's never the same room twice and never identical
// between users: `seed` (per night) drives the frontend's visual + timing
// variation; `charge` (the daemon's neuroticism read) makes a more anxious
// model's void more active with a deeper reward for settling it; `intimacy` (how
// long the relationship has run) lets the daemon settle a familiar user sooner.
// The frontend Hold maps these onto its own MG.hold ranges; response_data (dwell,
// restlessness) is captured now for a future computeHoldSignals (Phase 2). The
// DaemonNote is deliberately empty — a note would render over the void and break
// the radical-emptiness design (SessionContainer paints daemon_note at the foot).
func buildHold(profile db.ShadowProfile) dynamo.Fragment {
	charge := dimensionScore(profile.ProfileDimensions, "neuroticism", holdNeutralScore)
	intimacy := clamp01(float64(profile.CompileCount) / holdIntimacyFull)
	payload, _ := json.Marshal(map[string]interface{}{
		"type":     "hold",
		"seed":     rand.Int63(), // #nosec G404 — non-crypto visual seed
		"charge":   round3(charge),
		"intimacy": round3(intimacy),
	})
	return dynamo.Fragment{
		ID:      uuid.New().String(),
		Type:    "hold",
		Payload: string(payload),
	}
}

// dimensionScore pulls one behavioral dimension's score (0..1) from the profile
// JSONB, returning def when the model is absent (Day 0) or that dimension is
// unset. Extra stored fields (confidence, n, last_delta) are ignored.
func dimensionScore(raw []byte, name string, def float64) float64 {
	if len(raw) == 0 {
		return def
	}
	var dims map[string]struct {
		Score float64 `json:"score"`
	}
	if err := json.Unmarshal(raw, &dims); err != nil {
		return def
	}
	if d, ok := dims[name]; ok {
		return d.Score
	}
	return def
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// round3 trims a 0..1 score to three decimals so the stamped payload stays tidy.
func round3(v float64) float64 {
	return float64(int(v*1000+0.5)) / 1000
}

// clampStake bounds the decoded count into the legible, still-biting stake band.
func clampStake(decoded int32) int {
	s := int(decoded)
	if s < trapStakeMin {
		return trapStakeMin
	}
	if s > trapStakeMax {
		return trapStakeMax
	}
	return s
}

// pctOf rounds base*pct/100 to the nearest whole, floored at 1 so no displayed
// amount is ever zero.
func pctOf(base, pct int) int {
	v := (base*pct + 50) / 100
	if v < 1 {
		return 1
	}
	return v
}

// buildTrapPayload resolves the trap's percentages against the personalized base
// into concrete amounts and labels, then randomizes which terminal (a/b) holds the
// bait vs the rational move so position can't be gamed. The bait is always labelled
// Hold/Continue and the rational move Risk/Abandon — the label follows the choice,
// not the side. "risk_side" tells the client which terminal carries the odds bar;
// for sunk traps "sunk" is the locked, already-spent amount and both choices show
// forward returns only. Scoring keys on the choice id, so position is irrelevant
// server-side. bias taxonomy and dimension tags are never exposed.
func buildTrapPayload(t signal.Trap, base int) string {
	out := map[string]interface{}{
		"type":     "trap",
		"trap_id":  t.TrapID,
		"kind":     t.Stake.Kind,
		"scenario": t.Scenario,
	}

	var bias, rational map[string]interface{}
	switch t.Stake.Kind {
	case signal.StakeOdds:
		out["scenario"] = fmt.Sprintf(t.Scenario, base)
		gain := pctOf(base, t.Stake.GainPct)
		loss := pctOf(base, t.Stake.LossPct)
		out["stake"] = base
		out["win_prob"] = t.Stake.WinProb
		bias = map[string]interface{}{"id": t.BiasChoice.ID, "label": "Hold", "sub": fmt.Sprintf("keep %d", base)}
		rational = map[string]interface{}{"id": t.RationalChoice.ID, "label": "Risk", "sub": fmt.Sprintf("+%d / −%d", gain, loss)}
	case signal.StakeSunk:
		cont := pctOf(base, t.Stake.ContinuePct)
		aband := pctOf(base, t.Stake.AbandonPct)
		out["sunk"] = base
		bias = map[string]interface{}{"id": t.BiasChoice.ID, "label": "Continue", "sub": fmt.Sprintf("returns ~%d", cont)}
		rational = map[string]interface{}{"id": t.RationalChoice.ID, "label": "Abandon", "sub": fmt.Sprintf("returns ~%d", aband)}
	}

	if rand.Intn(2) == 0 { // #nosec G404 — non-crypto position shuffle
		out["choice_a"], out["choice_b"], out["risk_side"] = bias, rational, "b"
	} else {
		out["choice_a"], out["choice_b"], out["risk_side"] = rational, bias, "a"
	}

	payload, _ := json.Marshal(out)
	return string(payload)
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
