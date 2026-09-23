package deck

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/signal"
)

type fakeRecentResponseFetcher struct {
	responses []db.CardResponse
	err       error
}

func (f *fakeRecentResponseFetcher) GetRecentResponsesByType(ctx context.Context, arg db.GetRecentResponsesByTypeParams) ([]db.CardResponse, error) {
	return f.responses, f.err
}

// weightedScaleResponseRow builds a fake card_responses row for a Weighted
// Scale pair, leaning fully to whichever side scores "high" on wantDim
// (matching signal.LookupPair semantics exactly, the same reconstruction
// buildOddOneOut itself performs) or the opposite side if !high.
func weightedScaleResponseRow(t *testing.T, pair signal.Pair, wantDim string, high bool) db.CardResponse {
	t.Helper()
	ds, ok := pair.DimensionSignals[wantDim]
	if !ok {
		t.Fatalf("pair %q has no DimensionSignals for %q", pair.PairID, wantDim)
	}
	leanRight := high != ds.LeftHigh // mirrors buildOddOneOut's own high := leanedRight != ds.LeftHigh
	value := -1.0
	if leanRight {
		value = 1.0
	}
	body, err := json.Marshal([]weightedScaleResponse{{Left: pair.Left, Right: pair.Right, Value: value}})
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	return db.CardResponse{ResponseData: body}
}

// pairsForDimension returns up to n distinct real pairs from signal.Pairs
// tagged with dim, so the test exercises real content rather than invented
// text signal.LookupPair could never actually match.
func pairsForDimension(t *testing.T, dim string, n int) []signal.Pair {
	t.Helper()
	var out []signal.Pair
	for _, p := range signal.Pairs {
		if _, ok := p.DimensionSignals[dim]; ok {
			out = append(out, p)
			if len(out) == n {
				return out
			}
		}
	}
	t.Fatalf("fewer than %d real pairs tag dimension %q — pick a different test dimension", n, dim)
	return nil
}

func TestBuildOddOneOutNoHistory(t *testing.T) {
	g := &Generator{oddOneOutHistory: &fakeRecentResponseFetcher{}}
	if _, ok := g.buildOddOneOut(context.Background(), uuid.New()); ok {
		t.Fatal("buildOddOneOut should be unavailable with zero response history")
	}
}

func TestBuildOddOneOutUnavailableWhenNil(t *testing.T) {
	g := &Generator{} // zero-value, oddOneOutHistory nil -- mirrors every other special beat's test pattern
	if _, ok := g.buildOddOneOut(context.Background(), uuid.New()); ok {
		t.Fatal("buildOddOneOut should be unavailable when oddOneOutHistory is nil")
	}
}

func TestBuildOddOneOutInsufficientCluster(t *testing.T) {
	// Only 2 responses total -- nowhere near the 4-majority/1-minority bar.
	pairs := pairsForDimension(t, "conscientiousness", 2)
	g := &Generator{oddOneOutHistory: &fakeRecentResponseFetcher{responses: []db.CardResponse{
		weightedScaleResponseRow(t, pairs[0], "conscientiousness", true),
		weightedScaleResponseRow(t, pairs[1], "conscientiousness", false),
	}}}
	if _, ok := g.buildOddOneOut(context.Background(), uuid.New()); ok {
		t.Fatal("buildOddOneOut should be unavailable without enough responses to cluster")
	}
}

func TestBuildOddOneOutSelectsOutlier(t *testing.T) {
	const dim = "conscientiousness"
	highPairs := pairsForDimension(t, dim, 4)
	lowPair := pairsForDimension(t, dim, 5)[4] // a 5th distinct pair for the minority side

	var responses []db.CardResponse
	for _, p := range highPairs {
		responses = append(responses, weightedScaleResponseRow(t, p, dim, true))
	}
	minorityRow := weightedScaleResponseRow(t, lowPair, dim, false)
	responses = append(responses, minorityRow)

	g := &Generator{oddOneOutHistory: &fakeRecentResponseFetcher{responses: responses}}
	frag, ok := g.buildOddOneOut(context.Background(), uuid.New())
	if !ok {
		t.Fatal("buildOddOneOut !ok with a clean 4-vs-1 cluster on a real dimension")
	}
	if frag.Type != "odd_one_out" {
		t.Fatalf("type %q, want odd_one_out", frag.Type)
	}

	var payload struct {
		Dimension string `json:"dimension"`
		Quotes    []struct {
			ID   string `json:"id"`
			Text string `json:"text"`
		} `json:"quotes"`
		OutlierID string `json:"outlier_id"`
	}
	if err := json.Unmarshal([]byte(frag.Payload), &payload); err != nil {
		t.Fatalf("payload not valid JSON: %v", err)
	}
	if payload.Dimension != dim {
		t.Fatalf("dimension %q, want %q", payload.Dimension, dim)
	}
	if len(payload.Quotes) != 5 {
		t.Fatalf("got %d quotes, want 5", len(payload.Quotes))
	}

	var outlierText string
	foundOutlier := false
	for _, q := range payload.Quotes {
		if q.ID == payload.OutlierID {
			outlierText = q.Text
			foundOutlier = true
		}
	}
	if !foundOutlier {
		t.Fatal("outlier_id doesn't match any quote's id")
	}
	if outlierText != lowPair.Left && outlierText != lowPair.Right {
		t.Fatalf("outlier quote %q doesn't come from the minority pair %+v", outlierText, lowPair)
	}

	// No leaked dimension tags on the individual quotes -- only {id, text}.
	var raw map[string]json.RawMessage
	_ = json.Unmarshal([]byte(frag.Payload), &raw)
	var rawQuotes []map[string]json.RawMessage
	_ = json.Unmarshal(raw["quotes"], &rawQuotes)
	for _, q := range rawQuotes {
		if _, leaked := q["high"]; leaked {
			t.Fatal("quote item leaks the 'high' field to the client payload")
		}
	}
}

func TestBuildOddOneOutSkipsUnknownPairText(t *testing.T) {
	// A response whose (left, right) text doesn't match any real pair
	// (content since edited/retired) must be silently skipped, not guessed.
	body, _ := json.Marshal([]weightedScaleResponse{{Left: "not a real pair", Right: "also not real", Value: 1.0}})
	g := &Generator{oddOneOutHistory: &fakeRecentResponseFetcher{responses: []db.CardResponse{
		{ResponseData: body},
	}}}
	if _, ok := g.buildOddOneOut(context.Background(), uuid.New()); ok {
		t.Fatal("buildOddOneOut should skip unmatched pair text, not fabricate a dimension")
	}
}

func TestBuildDeckOddOneOutBeforeEligibility(t *testing.T) {
	g := &Generator{
		oddOneOutHistory: &fakeRecentResponseFetcher{}, // present but empty -- shouldn't matter, gate is CompileCount
	}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: oddOneOutMinCompiles - 1}
	for i := 0; i < 200; i++ {
		for _, f := range g.buildDeck(context.Background(), profile, nil, exclusions{}, db.TomorrowPrediction{}) {
			if f.Type == "odd_one_out" {
				t.Fatal("odd_one_out appeared before eligibility")
			}
		}
	}
}
