package deck

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/signal"
)

// fakePulseGenerator lets buildPulse's tests stay deterministic and offline —
// no test here ever makes a real Anthropic call.
type fakePulseGenerator struct {
	obs, pred string
	err       error
}

func (f *fakePulseGenerator) Generate(ctx context.Context, scenario *signal.Scenario, nodes []signal.ScenarioNode, archetype, stage string, confidences map[string]float64) (string, string, error) {
	return f.obs, f.pred, f.err
}

type pulsePayload struct {
	Type              string             `json:"type"`
	ScenarioID        string             `json:"scenario_id"`
	ScenarioType      string             `json:"scenario_type"`
	Text              string             `json:"text"`
	DaemonObservation string             `json:"daemon_observation"`
	DaemonPrediction  string             `json:"daemon_prediction"`
	Nodes             []pulseNodePayload `json:"nodes"`
}

func TestBuildPulse(t *testing.T) {
	gen := &fakePulseGenerator{obs: "the daemon watches.", pred: "you will notice a door."}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}

	f, ok := buildPulse(context.Background(), gen, profile, map[string]bool{})
	if !ok {
		t.Fatal("buildPulse !ok with a populated scenario library")
	}
	if f.Type != "pulse" {
		t.Fatalf("type %q, want pulse", f.Type)
	}
	if f.ID == "" {
		t.Fatal("pulse fragment has no ID")
	}

	var p pulsePayload
	if err := json.Unmarshal([]byte(f.Payload), &p); err != nil {
		t.Fatalf("pulse payload is not valid JSON: %v", err)
	}
	if p.Type != "pulse" || p.ScenarioID == "" || p.Text == "" {
		t.Fatalf("incomplete pulse payload: %+v", p)
	}
	if p.DaemonObservation != gen.obs || p.DaemonPrediction != gen.pred {
		t.Fatalf("payload text = %q/%q, want %q/%q", p.DaemonObservation, p.DaemonPrediction, gen.obs, gen.pred)
	}
	if len(p.Nodes) != pulseNodesPerMap {
		t.Fatalf("got %d nodes, want %d", len(p.Nodes), pulseNodesPerMap)
	}
	seen := map[string]bool{}
	for _, n := range p.Nodes {
		if n.ID == "" || n.Text == "" {
			t.Fatalf("pulse node missing id/text: %+v", n)
		}
		if seen[n.ID] {
			t.Fatalf("node %q appeared twice in one map", n.ID)
		}
		seen[n.ID] = true
	}

	// Dimension tags are server-only (the Analyst recovers them via
	// signal.LookupScenarioNode) — the raw payload must never carry them.
	if strings.Contains(f.Payload, "dimension_signals") {
		t.Fatal("pulse payload leaked dimension_signals to the client")
	}
}

func TestBuildPulseFallsBackOnGeneratorError(t *testing.T) {
	gen := &fakePulseGenerator{err: context.DeadlineExceeded}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}

	f, ok := buildPulse(context.Background(), gen, profile, map[string]bool{})
	if !ok {
		t.Fatal("buildPulse !ok on generator error — a hedged Map should beat no Map")
	}
	var p pulsePayload
	if err := json.Unmarshal([]byte(f.Payload), &p); err != nil {
		t.Fatalf("payload: %v", err)
	}
	if p.DaemonObservation != signal.FallbackObservation {
		t.Fatalf("observation %q, want the fallback text", p.DaemonObservation)
	}
	found := false
	for _, fp := range signal.FallbackPredictions {
		if p.DaemonPrediction == fp {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("prediction %q not one of the fallback predictions", p.DaemonPrediction)
	}
}

func TestBuildPulseNoGenerator(t *testing.T) {
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}
	if _, ok := buildPulse(context.Background(), nil, profile, map[string]bool{}); ok {
		t.Fatal("buildPulse should be unavailable with no generator configured (zero-value Generator)")
	}
}

func TestSelectPulseScenarioExcludesServed(t *testing.T) {
	dims := map[string]float64{}
	first := selectPulseScenario(dims, map[string]bool{}, 100)
	if first == nil {
		t.Fatal("no scenario for an eligible profile")
	}
	exclude := map[string]bool{first.ScenarioID: true}
	for i := 0; i < 50; i++ {
		next := selectPulseScenario(dims, exclude, 100)
		if next == nil {
			t.Fatal("selectPulseScenario returned nil with alternatives available")
		}
		if next.ScenarioID == first.ScenarioID {
			t.Fatalf("scenario %q repeated despite exclusion (library has %d scenarios)", first.ScenarioID, len(signal.Scenarios))
		}
	}
}

func TestUsedContentIDsCollectsPulse(t *testing.T) {
	gen := &fakePulseGenerator{obs: "o", pred: "p"}
	frag, ok := buildPulse(context.Background(), gen, db.ShadowProfile{CompileCount: 20}, map[string]bool{})
	if !ok {
		t.Fatal("buildPulse !ok")
	}
	var p pulsePayload
	if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
		t.Fatalf("payload: %v", err)
	}

	ex := usedContentIDs(&dynamo.DailyDeck{Fragments: []dynamo.Fragment{frag}})
	if !ex.pulseScenarioIDs[p.ScenarioID] {
		t.Fatalf("scenario_id %q not collected into exclusions: %v", p.ScenarioID, ex.pulseScenarioIDs)
	}
}

// TestBuildDeckPulseSelection verifies The Map is mutually exclusive with
// every other special middle beat and never breaks the deck's 5-6 length arc.
func TestBuildDeckPulseSelection(t *testing.T) {
	g := &Generator{pulseGen: &fakePulseGenerator{obs: "o", pred: "p"}}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 20}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	sawPulse := false
	for i := 0; i < 500; i++ {
		deck := g.buildDeck(context.Background(), profile, patterns, exclusions{}, db.TomorrowPrediction{})
		pulses, traps, holds, splits, cuts := 0, 0, 0, 0, 0
		for _, f := range deck {
			switch f.Type {
			case "pulse":
				pulses++
			case "trap":
				traps++
			case "hold":
				holds++
			case "split":
				splits++
			case "cut":
				cuts++
			}
		}
		if pulses > 0 && (traps > 0 || holds > 0 || splits > 0 || cuts > 0) {
			t.Fatalf("pulse shared a night with another special beat: %v", deckTypes(deck))
		}
		if pulses > 1 {
			t.Fatalf("deck has %d pulses: %v", pulses, deckTypes(deck))
		}
		if pulses == 1 && (len(deck) < 5 || len(deck) > 6) {
			t.Fatalf("pulse deck length %d, want 5-6: %v", len(deck), deckTypes(deck))
		}
		sawPulse = sawPulse || pulses == 1
	}
	if !sawPulse {
		t.Fatal("pulse never appeared across 500 decks for an eligible user with a configured generator")
	}
}

func TestBuildDeckPulseBeforeEligibility(t *testing.T) {
	g := &Generator{pulseGen: &fakePulseGenerator{obs: "o", pred: "p"}}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 0} // below pulseMinCompiles
	for i := 0; i < 50; i++ {
		for _, f := range g.buildDeck(context.Background(), profile, nil, exclusions{}, db.TomorrowPrediction{}) {
			if f.Type == "pulse" {
				t.Fatal("pulse appeared before eligibility")
			}
		}
	}
}
