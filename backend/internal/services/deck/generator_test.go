package deck

import (
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
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 30}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	for i := 0; i < 200; i++ {
		deck := g.buildDeck(profile, patterns, nil)

		if len(deck) < 5 || len(deck) > 6 {
			t.Fatalf("deck length %d, want 5-6", len(deck))
		}
		if deck[0].Type != "reaction_test" {
			t.Fatalf("opener type %q, want reaction_test", deck[0].Type)
		}
		if deck[len(deck)-1].Type != "prediction_duel" {
			t.Fatalf("closer type %q, want prediction_duel", deck[len(deck)-1].Type)
		}
		for j, f := range deck {
			if f.Order != j {
				t.Fatalf("fragment %d has Order %d", j, f.Order)
			}
		}
		// 2 scales always admits a violation-free order; 3 scales against
		// 2 reaction tests forces at most one same-type adjacency.
		if v := adjacencyViolations(deck, ""); v > 1 {
			t.Fatalf("deck has %d adjacency violations: %v", v, deckTypes(deck))
		}
	}
}

func TestBuildDeckNoPatternsHasNoDuel(t *testing.T) {
	g := &Generator{}
	deck := g.buildDeck(db.ShadowProfile{PrimaryArchetype: "default"}, nil, nil)
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

func TestUsedPairIDs(t *testing.T) {
	prev := &dynamo.DailyDeck{Fragments: []dynamo.Fragment{
		{Type: "weighted_scale", Payload: `{"left":"a","right":"b","pair_id":"p1"}`},
		{Type: "weighted_scale", Payload: `{"left":"c","right":"d"}`}, // pre-stamp payload
		{Type: "reaction_test", Payload: `{"words":["x"]}`},
		{Type: "weighted_scale", Payload: `not json`},
	}}
	ids := usedPairIDs(prev)
	if len(ids) != 1 || !ids["p1"] {
		t.Fatalf("got %v, want {p1}", ids)
	}
	if got := usedPairIDs(nil); len(got) != 0 {
		t.Fatalf("nil deck produced exclusions: %v", got)
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
