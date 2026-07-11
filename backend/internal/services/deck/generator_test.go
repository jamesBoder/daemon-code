package deck

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/signal"
)

func namedPattern(name string, strength int32) db.PatternLibrary {
	return db.PatternLibrary{
		ID:       uuid.New(),
		Name:     pgtype.Text{String: name, Valid: true},
		Strength: strength,
	}
}

func TestBuildDeckArc(t *testing.T) {
	g := &Generator{}
	// CompileCount 20: choice-traps are eligible (>=14) but the overconfidence
	// estimate is not (>=21), so the opener is always a fast game and length holds
	// 5-6. The overconfidence-leading arc has its own test.
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	sawSpeedRound := false
	for i := 0; i < 200; i++ {
		deck := g.buildDeck(profile, patterns, exclusions{}, db.TomorrowPrediction{})

		if len(deck) < 5 || len(deck) > 6 {
			t.Fatalf("deck length %d, want 5-6", len(deck))
		}
		if deck[0].Type != "reaction_test" && deck[0].Type != "speed_round" {
			t.Fatalf("opener type %q, want a fast game", deck[0].Type)
		}
		if deck[len(deck)-1].Type != "prediction_duel" {
			t.Fatalf("closer type %q, want prediction_duel", deck[len(deck)-1].Type)
		}
		reactions, speeds := 0, 0
		for j, f := range deck {
			if f.Order != j {
				t.Fatalf("fragment %d has Order %d", j, f.Order)
			}
			switch f.Type {
			case "reaction_test":
				reactions++
			case "speed_round":
				speeds++
			}
		}
		// One reaction test always plays (word signals must flow nightly);
		// the second fast slot is either the other reaction test or one speed round.
		if reactions < 1 {
			t.Fatalf("deck has no reaction test: %v", deckTypes(deck))
		}
		if speeds > 1 {
			t.Fatalf("deck has %d speed rounds: %v", speeds, deckTypes(deck))
		}
		sawSpeedRound = sawSpeedRound || speeds == 1
		// 2 scales always admits a violation-free order; 3 scales against
		// 2 fast games forces at most one same-type adjacency.
		if v := adjacencyViolations(deck, ""); v > 1 {
			t.Fatalf("deck has %d adjacency violations: %v", v, deckTypes(deck))
		}
	}
	if !sawSpeedRound {
		t.Fatal("speed round never appeared across 200 decks for an eligible user")
	}
}

func TestBuildDeckBeforeSpeedRoundEligibility(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 0}
	for i := 0; i < 50; i++ {
		for _, f := range g.buildDeck(profile, nil, exclusions{}, db.TomorrowPrediction{}) {
			if f.Type == "speed_round" {
				t.Fatal("speed round appeared before eligibility")
			}
		}
	}
}

func TestBuildSpeedRoundExcludesServed(t *testing.T) {
	frag, ok := buildSpeedRound(100, nil)
	if !ok {
		t.Fatal("no speed round for eligible user")
	}
	var p struct {
		PromptIDs []string `json:"prompt_ids"`
		Prompts   []struct {
			Starter string   `json:"starter"`
			Options []string `json:"options"`
		} `json:"prompts"`
	}
	if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
		t.Fatalf("payload: %v", err)
	}
	if len(p.Prompts) != speedPromptsPerRound || len(p.PromptIDs) != speedPromptsPerRound {
		t.Fatalf("got %d prompts / %d ids, want %d", len(p.Prompts), len(p.PromptIDs), speedPromptsPerRound)
	}

	exclude := map[string]bool{}
	for _, id := range p.PromptIDs {
		exclude[id] = true
	}
	for i := 0; i < 50; i++ {
		next, ok := buildSpeedRound(100, exclude)
		if !ok {
			t.Fatal("exclusion emptied the speed round")
		}
		var np struct {
			PromptIDs []string `json:"prompt_ids"`
		}
		if err := json.Unmarshal([]byte(next.Payload), &np); err != nil {
			t.Fatalf("payload: %v", err)
		}
		for _, id := range np.PromptIDs {
			if exclude[id] {
				t.Fatalf("prompt %q repeated despite exclusion", id)
			}
		}
	}
}

func TestBuildDeckNoPatternsHasNoDuel(t *testing.T) {
	g := &Generator{}
	deck := g.buildDeck(db.ShadowProfile{PrimaryArchetype: "default"}, nil, exclusions{}, db.TomorrowPrediction{})
	for _, f := range deck {
		if f.Type == "prediction_duel" {
			t.Fatal("duel present without patterns")
		}
	}
}

func TestPickScalePairsExcludesServed(t *testing.T) {
	exclude := map[string]bool{}
	for _, p := range pickScalePairs(3, 100, nil) {
		exclude[p.PairID] = true
	}
	// Plenty of eligible pairs remain, so none of yesterday's may reappear.
	for i := 0; i < 50; i++ {
		for _, p := range pickScalePairs(3, 100, exclude) {
			if exclude[p.PairID] {
				t.Fatalf("pair %q repeated despite exclusion", p.PairID)
			}
		}
	}
}

func TestPickScalePairsFallsBackWhenPoolTooSmall(t *testing.T) {
	// Exclude every eligible pair: the fallback must still fill the request.
	exclude := map[string]bool{}
	eligible := 0
	for _, p := range signal.Pairs {
		if p.IntroducedAfterDay <= 100 {
			exclude[p.PairID] = true
			eligible++
		}
	}
	want := 3
	if eligible < want {
		want = eligible
	}
	if got := len(pickScalePairs(3, 100, exclude)); got != want {
		t.Fatalf("got %d pairs, want %d", got, want)
	}
}

func TestUsedContentIDs(t *testing.T) {
	prev := &dynamo.DailyDeck{Fragments: []dynamo.Fragment{
		{Type: "weighted_scale", Payload: `{"left":"a","right":"b","pair_id":"p1"}`},
		{Type: "weighted_scale", Payload: `{"left":"c","right":"d"}`}, // pre-stamp payload
		{Type: "reaction_test", Payload: `{"words":["x"]}`},
		{Type: "weighted_scale", Payload: `not json`},
		{Type: "speed_round", Payload: `{"prompts":[],"prompt_ids":["sp1","sp2"]}`},
	}}
	ex := usedContentIDs(prev)
	if len(ex.pairIDs) != 1 || !ex.pairIDs["p1"] {
		t.Fatalf("pairIDs = %v, want {p1}", ex.pairIDs)
	}
	if len(ex.speedPromptIDs) != 2 || !ex.speedPromptIDs["sp1"] || !ex.speedPromptIDs["sp2"] {
		t.Fatalf("speedPromptIDs = %v, want {sp1, sp2}", ex.speedPromptIDs)
	}
	if got := usedContentIDs(nil); len(got.pairIDs)+len(got.speedPromptIDs) != 0 {
		t.Fatalf("nil deck produced exclusions: %v", got)
	}
}

func TestReactionTestSampling(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "abandoned_child", CompileCount: 10}

	type rtPayload struct {
		Words []string `json:"words"`
	}
	for i := 0; i < 100; i++ {
		deck := g.buildDeck(profile, nil, exclusions{}, db.TomorrowPrediction{})
		seen := map[string]bool{}
		for _, f := range deck {
			if f.Type != "reaction_test" {
				continue
			}
			var p rtPayload
			if err := json.Unmarshal([]byte(f.Payload), &p); err != nil {
				t.Fatalf("payload: %v", err)
			}
			if len(p.Words) != wordsPerTest {
				t.Fatalf("got %d words, want %d", len(p.Words), wordsPerTest)
			}
			for _, w := range p.Words {
				if _, ok := signal.Lookup(w); !ok {
					t.Fatalf("sampled word %q not in library — analyst can't score it", w)
				}
				if seen[w] {
					t.Fatalf("word %q repeated within one deck", w)
				}
				seen[w] = true
			}
		}
	}
}

func TestSampleWordsExcludesServed(t *testing.T) {
	pool := signal.CoreWords("caged_rage") // 10 words
	first := sampleWords(pool, 4, nil)
	exclude := map[string]bool{}
	for _, w := range first {
		exclude[w] = true
	}
	// 6 fresh words remain for a 4-word request: exclusion must hold.
	for i := 0; i < 50; i++ {
		for _, w := range sampleWords(pool, 4, exclude) {
			if exclude[w] {
				t.Fatalf("word %q repeated despite exclusion", w)
			}
		}
	}
	// Excluding the entire pool: fallback must still fill the request.
	all := map[string]bool{}
	for _, w := range pool {
		all[w.Text] = true
	}
	if got := len(sampleWords(pool, 4, all)); got != 4 {
		t.Fatalf("fallback returned %d words, want 4", got)
	}
}

func TestBuildPredictionDuelPayload(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{DaemonAccuracy: 63}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	type duelPayload struct {
		Pattern      string `json:"pattern"`
		Prediction   string `json:"prediction"`
		DaemonRecord int32  `json:"daemon_record"`
	}

	// Template fallback: humanized name, no internal form, record stamped.
	var p duelPayload
	frag := g.buildPredictionDuel(profile, patterns, db.TomorrowPrediction{})
	if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
		t.Fatalf("payload: %v", err)
	}
	if p.Prediction != "You will notice the approval loop today." {
		t.Fatalf("fallback prediction = %q", p.Prediction)
	}
	if p.DaemonRecord != 63 {
		t.Fatalf("daemon_record = %d, want 63", p.DaemonRecord)
	}
	if p.Pattern != "the_approval_loop.process" {
		t.Fatalf("pattern metadata = %q", p.Pattern)
	}

	// Analyst-authored prediction served verbatim with its own pattern.
	pred := db.TomorrowPrediction{Text: "You will say yes to something you wanted to refuse.", PatternName: "the_other_first.process"}
	frag = g.buildPredictionDuel(profile, patterns, pred)
	if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
		t.Fatalf("payload: %v", err)
	}
	if p.Prediction != pred.Text {
		t.Fatalf("prediction = %q, want analyst text", p.Prediction)
	}
	if p.Pattern != pred.PatternName {
		t.Fatalf("pattern = %q, want analyst pattern", p.Pattern)
	}
}

func TestHumanizePatternName(t *testing.T) {
	cases := map[string]string{
		"the_approval_loop.process": "the approval loop",
		"the_never_again.process":   "the never again",
		"unknown_pattern":           "a familiar pattern",
	}
	for in, want := range cases {
		if got := humanizePatternName(in); got != want {
			t.Fatalf("humanizePatternName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPickPatternWeighted(t *testing.T) {
	if p := pickPatternWeighted(nil); p.Name.Valid {
		t.Fatal("empty input returned a named pattern")
	}
	if p := pickPatternWeighted([]db.PatternLibrary{{Strength: 50}}); p.Name.Valid {
		t.Fatal("unnamed pattern was selected")
	}

	patterns := []db.PatternLibrary{
		namedPattern("strong", 90),
		namedPattern("weak", 10),
		{Strength: 80}, // unnamed — never eligible
	}
	seen := map[string]bool{}
	for i := 0; i < 500; i++ {
		p := pickPatternWeighted(patterns)
		if !p.Name.Valid {
			t.Fatal("returned unnamed pattern")
		}
		seen[p.Name.String] = true
	}
	if !seen["strong"] || !seen["weak"] {
		t.Fatalf("weighted pick never varied: %v", seen)
	}
}

func deckTypes(deck []dynamo.Fragment) []string {
	types := make([]string, len(deck))
	for i, f := range deck {
		types[i] = f.Type
	}
	return types
}

func TestBuildHold(t *testing.T) {
	profile := db.ShadowProfile{
		CompileCount:      0,
		ProfileDimensions: []byte(`{"neuroticism":{"score":0.8,"confidence":0.5}}`),
	}
	f := buildHold(profile)
	if f.Type != "hold" {
		t.Fatalf("type %q, want hold", f.Type)
	}
	if f.ID == "" {
		t.Fatal("hold fragment has no ID")
	}
	// The note must stay empty — a daemon_note renders over the void and breaks
	// the radical-emptiness design.
	if f.DaemonNote != "" {
		t.Fatalf("hold daemon_note %q, want empty", f.DaemonNote)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(f.Payload), &payload); err != nil {
		t.Fatalf("hold payload is not valid JSON: %v", err)
	}
	if payload["type"] != "hold" {
		t.Fatalf("hold payload type %v, want hold", payload["type"])
	}
	// charge mirrors the neuroticism read; intimacy is 0 at compile 0.
	if got := payload["charge"].(float64); got != 0.8 {
		t.Fatalf("charge %v, want 0.8 (from neuroticism)", got)
	}
	if got := payload["intimacy"].(float64); got != 0 {
		t.Fatalf("intimacy %v, want 0 at compile 0", got)
	}
	if _, ok := payload["seed"]; !ok {
		t.Fatal("hold payload has no seed")
	}
}

func TestBuildHoldPersonalization(t *testing.T) {
	// Absent model → neutral charge; deep relationship → full intimacy.
	day0 := buildHoldPayload(t, db.ShadowProfile{CompileCount: 0})
	if day0["charge"].(float64) != holdNeutralScore {
		t.Fatalf("day-0 charge %v, want neutral %v", day0["charge"], holdNeutralScore)
	}
	veteran := buildHoldPayload(t, db.ShadowProfile{CompileCount: holdIntimacyFull * 2})
	if veteran["intimacy"].(float64) != 1 {
		t.Fatalf("veteran intimacy %v, want clamped to 1", veteran["intimacy"])
	}
	// Per-night uniqueness: two builds get different seeds (the void is never the
	// same room twice).
	a := buildHoldPayload(t, db.ShadowProfile{CompileCount: 10})
	b := buildHoldPayload(t, db.ShadowProfile{CompileCount: 10})
	if a["seed"] == b["seed"] {
		t.Fatal("two holds shared a seed — the void should vary per night")
	}
}

func buildHoldPayload(t *testing.T, profile db.ShadowProfile) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal([]byte(buildHold(profile).Payload), &payload); err != nil {
		t.Fatalf("hold payload is not valid JSON: %v", err)
	}
	return payload
}

// The Hold appears for eligible users and never shares a night with a trap (the
// two are tonally opposite). Decks that include it still hold the 5-6 length.
func TestBuildDeckHoldSelection(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	sawHold := false
	for i := 0; i < 500; i++ {
		deck := g.buildDeck(profile, patterns, exclusions{}, db.TomorrowPrediction{})
		holds, traps := 0, 0
		for _, f := range deck {
			switch f.Type {
			case "hold":
				holds++
			case "trap":
				traps++
			}
		}
		if holds > 0 && traps > 0 {
			t.Fatalf("hold shared a night with a trap: %v", deckTypes(deck))
		}
		if holds > 1 {
			t.Fatalf("deck has %d holds: %v", holds, deckTypes(deck))
		}
		if holds == 1 && (len(deck) < 5 || len(deck) > 6) {
			t.Fatalf("hold deck length %d, want 5-6: %v", len(deck), deckTypes(deck))
		}
		sawHold = sawHold || holds == 1
	}
	if !sawHold {
		t.Fatal("hold never appeared across 500 decks for an eligible user")
	}
}

// Before its unlock, the Hold must never enter the deck.
func TestBuildDeckHoldBeforeEligibility(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: holdMinCompiles - 1}
	for i := 0; i < 200; i++ {
		for _, f := range g.buildDeck(profile, nil, exclusions{}, db.TomorrowPrediction{}) {
			if f.Type == "hold" {
				t.Fatal("hold appeared before eligibility")
			}
		}
	}
}

func TestBuildSplit(t *testing.T) {
	f := buildSplit(db.ShadowProfile{CompileCount: 10})
	if f.Type != "split" {
		t.Fatalf("type %q, want split", f.Type)
	}
	if f.ID == "" {
		t.Fatal("split fragment has no ID")
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(f.Payload), &payload); err != nil {
		t.Fatalf("split payload is not valid JSON: %v", err)
	}
	if payload["type"] != "split" {
		t.Fatalf("split payload type %v, want split", payload["type"])
	}
	if _, ok := payload["seed"]; !ok {
		t.Fatal("split payload has no seed")
	}
	framing, ok := payload["framing"].(string)
	if !ok || framing == "" {
		t.Fatalf("split framing %v, want a non-empty string", payload["framing"])
	}
	// The framing must come from the curated set, never invented.
	found := false
	for _, fr := range splitFramings {
		if fr == framing {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("split framing %q is not one of splitFramings", framing)
	}
}

func TestBuildSplitVariesPerNight(t *testing.T) {
	// Per-night uniqueness: two builds get different seeds (the table is never
	// identical), so the frontend's counterpart presence varies.
	a := buildSplit(db.ShadowProfile{CompileCount: 10})
	b := buildSplit(db.ShadowProfile{CompileCount: 10})
	var pa, pb map[string]any
	if err := json.Unmarshal([]byte(a.Payload), &pa); err != nil {
		t.Fatalf("payload a not valid JSON: %v", err)
	}
	if err := json.Unmarshal([]byte(b.Payload), &pb); err != nil {
		t.Fatalf("payload b not valid JSON: %v", err)
	}
	if pa["seed"] == pb["seed"] {
		t.Fatal("two splits shared a seed — the table should vary per night")
	}
}

// The Split appears for eligible users and never shares a night with a trap or a
// hold (one special middle beat per session). Decks that include it still hold
// the 5-6 length.
func TestBuildDeckSplitSelection(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	sawSplit := false
	for i := 0; i < 500; i++ {
		deck := g.buildDeck(profile, patterns, exclusions{}, db.TomorrowPrediction{})
		splits, traps, holds := 0, 0, 0
		for _, f := range deck {
			switch f.Type {
			case "split":
				splits++
			case "trap":
				traps++
			case "hold":
				holds++
			}
		}
		if splits > 0 && (traps > 0 || holds > 0) {
			t.Fatalf("split shared a night with a trap/hold: %v", deckTypes(deck))
		}
		if splits > 1 {
			t.Fatalf("deck has %d splits: %v", splits, deckTypes(deck))
		}
		if splits == 1 && (len(deck) < 5 || len(deck) > 6) {
			t.Fatalf("split deck length %d, want 5-6: %v", len(deck), deckTypes(deck))
		}
		sawSplit = sawSplit || splits == 1
	}
	if !sawSplit {
		t.Fatal("split never appeared across 500 decks for an eligible user")
	}
}

// Before its unlock, the Split must never enter the deck.
func TestBuildDeckSplitBeforeEligibility(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: splitMinCompiles - 1}
	for i := 0; i < 200; i++ {
		for _, f := range g.buildDeck(profile, nil, exclusions{}, db.TomorrowPrediction{}) {
			if f.Type == "split" {
				t.Fatal("split appeared before eligibility")
			}
		}
	}
}

func TestBuildCut(t *testing.T) {
	f := buildCut(map[string]bool{})
	if f.Type != "cut" {
		t.Fatalf("type %q, want cut", f.Type)
	}
	if f.ID == "" {
		t.Fatal("cut fragment has no ID")
	}
	var payload struct {
		Type       string `json:"type"`
		Seed       int64  `json:"seed"`
		KeepBudget int    `json:"keep_budget"`
		Items      []struct {
			ID       string `json:"id"`
			Text     string `json:"text"`
			Temporal string `json:"temporal"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(f.Payload), &payload); err != nil {
		t.Fatalf("cut payload is not valid JSON: %v", err)
	}
	if payload.Type != "cut" {
		t.Fatalf("cut payload type %q, want cut", payload.Type)
	}
	if payload.KeepBudget != cutKeepBudget {
		t.Fatalf("keep_budget %d, want %d", payload.KeepBudget, cutKeepBudget)
	}
	if len(payload.Items) != cutFieldSize {
		t.Fatalf("field has %d items, want %d", len(payload.Items), cutFieldSize)
	}
	// The field must be balanced across temporal buckets — an uneven field
	// would make the sacrifice pattern unreadable for temporal_focus.
	counts := map[string]int{}
	seen := map[string]bool{}
	for _, it := range payload.Items {
		if it.ID == "" || it.Text == "" {
			t.Fatalf("cut item missing id/text: %+v", it)
		}
		if seen[it.ID] {
			t.Fatalf("cut item %q appeared twice in one field", it.ID)
		}
		seen[it.ID] = true
		counts[it.Temporal]++
	}
	for _, bucket := range []string{signal.CutTemporalPast, signal.CutTemporalFuture, signal.CutTemporalNeutral} {
		if counts[bucket] != cutFieldPerBucket {
			t.Fatalf("bucket %q has %d items, want %d (counts: %+v)", bucket, counts[bucket], cutFieldPerBucket, counts)
		}
	}
}

func TestBuildCutVariesPerNight(t *testing.T) {
	a := buildCut(map[string]bool{})
	b := buildCut(map[string]bool{})
	var pa, pb map[string]any
	if err := json.Unmarshal([]byte(a.Payload), &pa); err != nil {
		t.Fatalf("payload a not valid JSON: %v", err)
	}
	if err := json.Unmarshal([]byte(b.Payload), &pb); err != nil {
		t.Fatalf("payload b not valid JSON: %v", err)
	}
	if pa["seed"] == pb["seed"] {
		t.Fatal("two cuts shared a seed — the field should vary per night")
	}
}

// Items served last night must be excluded from tonight's field whenever the
// fresh pool per bucket is large enough to avoid them (mirrors pickScalePairs).
func TestPickCutItemsExcludesServed(t *testing.T) {
	exclude := map[string]bool{}
	for _, it := range signal.CutItems {
		if it.Temporal == signal.CutTemporalPast {
			exclude[it.ID] = true
		}
	}
	// Exclude all but two past items — still more than cutFieldPerBucket (3)
	// short, so this asserts the fallback-to-served path, not avoidance.
	var pastCount int
	for _, it := range signal.CutItems {
		if it.Temporal == signal.CutTemporalPast {
			pastCount++
		}
	}
	if pastCount <= cutFieldPerBucket {
		t.Skip("not enough past items in the pool to test exclusion")
	}
	field := pickCutItems(exclude)
	for _, it := range field {
		if it.Temporal != signal.CutTemporalPast {
			continue
		}
		if !exclude[it.ID] {
			t.Fatalf("past item %q should have been excluded but the fresh pool had plenty left", it.ID)
		}
	}
}

// The Cut appears for eligible users and never shares a night with a trap,
// hold, or split (one special middle beat per session). Decks that include it
// still hold the 5-6 length.
func TestBuildDeckCutSelection(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	sawCut := false
	for i := 0; i < 500; i++ {
		deck := g.buildDeck(profile, patterns, exclusions{}, db.TomorrowPrediction{})
		cuts, traps, holds, splits := 0, 0, 0, 0
		for _, f := range deck {
			switch f.Type {
			case "cut":
				cuts++
			case "trap":
				traps++
			case "hold":
				holds++
			case "split":
				splits++
			}
		}
		if cuts > 0 && (traps > 0 || holds > 0 || splits > 0) {
			t.Fatalf("cut shared a night with a trap/hold/split: %v", deckTypes(deck))
		}
		if cuts > 1 {
			t.Fatalf("deck has %d cuts: %v", cuts, deckTypes(deck))
		}
		if cuts == 1 && (len(deck) < 5 || len(deck) > 6) {
			t.Fatalf("cut deck length %d, want 5-6: %v", len(deck), deckTypes(deck))
		}
		sawCut = sawCut || cuts == 1
	}
	if !sawCut {
		t.Fatal("cut never appeared across 500 decks for an eligible user")
	}
}

// Before its unlock, the Cut must never enter the deck.
func TestBuildDeckCutBeforeEligibility(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: cutMinCompiles - 1}
	for i := 0; i < 200; i++ {
		for _, f := range g.buildDeck(profile, nil, exclusions{}, db.TomorrowPrediction{}) {
			if f.Type == "cut" {
				t.Fatal("cut appeared before eligibility")
			}
		}
	}
}
