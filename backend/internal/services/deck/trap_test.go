package deck

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/signal"
)

// allTrapsExcept returns an exclusion set covering every trap but keepID, so
// buildTrap's selection becomes deterministic.
func allTrapsExcept(keepID string) map[string]bool {
	ex := map[string]bool{}
	for _, t := range signal.Traps {
		if t.TrapID != keepID {
			ex[t.TrapID] = true
		}
	}
	return ex
}

func TestClampStake(t *testing.T) {
	cases := []struct{ in, want int32 }{
		{0, trapStakeMin}, {3, trapStakeMin}, {11, 11}, {24, 24}, {40, trapStakeMax},
	}
	for _, c := range cases {
		if got := int32(clampStake(c.in)); got != c.want {
			t.Errorf("clampStake(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}

type trapPayload struct {
	TrapID   string `json:"trap_id"`
	Kind     string `json:"kind"`
	Scenario string `json:"scenario"`
	Stake    int    `json:"stake"`
	Sunk     int    `json:"sunk"`
	WinProb  int    `json:"win_prob"`
	RiskSide string `json:"risk_side"`
	ChoiceA  struct{ ID, Sub string } `json:"choice_a"`
	ChoiceB  struct{ ID, Sub string } `json:"choice_b"`
}

// choiceByID returns the (id, sub) for the terminal at the given side ("a"|"b").
func (p trapPayload) side(s string) (id, sub string) {
	if s == "a" {
		return p.ChoiceA.ID, p.ChoiceA.Sub
	}
	return p.ChoiceB.ID, p.ChoiceB.Sub
}

func TestBuildTrapOddsPayload(t *testing.T) {
	profile := db.ShadowProfile{CompileCount: 30, FragmentsDecoded: 11}
	// Run several times: position is randomized, so assertions must be order-free.
	for i := 0; i < 20; i++ {
		frag, ok := buildTrap(profile, allTrapsExcept("loss_aversion_pot_001"))
		if !ok || frag.Type != "trap" {
			t.Fatalf("buildTrap ok=%v type=%q", ok, frag.Type)
		}
		var p trapPayload
		if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
			t.Fatal(err)
		}
		if p.TrapID != "loss_aversion_pot_001" || p.Kind != "odds" {
			t.Fatalf("unexpected trap %+v", p)
		}
		if p.Stake != 11 || p.WinProb != 70 {
			t.Errorf("stake=%d win_prob=%d, want 11 / 70", p.Stake, p.WinProb)
		}
		// Both choices present, regardless of which side each landed on.
		ids := map[string]bool{p.ChoiceA.ID: true, p.ChoiceB.ID: true}
		if !ids["hold"] || !ids["risk"] {
			t.Errorf("choice ids = %q / %q, want {hold, risk}", p.ChoiceA.ID, p.ChoiceB.ID)
		}
		// risk_side must point at the rational (risk) terminal, and its sub is the payoff.
		if id, sub := p.side(p.RiskSide); id != "risk" || !strings.HasPrefix(sub, "+") {
			t.Errorf("risk_side %q points at id=%q sub=%q, want risk / +...", p.RiskSide, id, sub)
		}
		if !strings.Contains(p.Scenario, "11") {
			t.Errorf("scenario missing personalized stake: %q", p.Scenario)
		}
		if strings.Contains(frag.Payload, "approach_avoidance") || strings.Contains(frag.Payload, "dimension") {
			t.Errorf("payload leaked server-only tags: %s", frag.Payload)
		}
	}
}

func TestBuildTrapSunkPayload(t *testing.T) {
	profile := db.ShadowProfile{CompileCount: 30, FragmentsDecoded: 12}
	for i := 0; i < 20; i++ {
		frag, ok := buildTrap(profile, allTrapsExcept("sunk_cost_path_001"))
		if !ok {
			t.Fatal("buildTrap returned !ok")
		}
		var p trapPayload
		if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
			t.Fatal(err)
		}
		if p.Kind != "sunk" || p.Sunk != 12 {
			t.Errorf("kind=%q sunk=%d, want sunk / 12", p.Kind, p.Sunk)
		}
		ids := map[string]bool{p.ChoiceA.ID: true, p.ChoiceB.ID: true}
		if !ids["continue"] || !ids["abandon"] {
			t.Errorf("choice ids = %q / %q, want {continue, abandon}", p.ChoiceA.ID, p.ChoiceB.ID)
		}
	}
}

func TestBuildOverconfidenceTrap(t *testing.T) {
	frag := buildOverconfidenceTrap()
	if frag.Type != "trap" {
		t.Fatalf("type = %q, want trap", frag.Type)
	}
	var p struct {
		TrapID   string `json:"trap_id"`
		Kind     string `json:"kind"`
		Scenario string `json:"scenario"`
		Max      int    `json:"max"`
	}
	if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
		t.Fatal(err)
	}
	if p.Kind != "overconfidence" || p.TrapID != "overconfidence_estimate" || p.Max != overconfidenceSliderMax {
		t.Fatalf("unexpected overconfidence payload %+v", p)
	}
	if p.Scenario == "" {
		t.Error("overconfidence scenario is empty")
	}
}

func TestOverconfidenceLeadsDeckAndIsExclusive(t *testing.T) {
	g := &Generator{}
	profile := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 40}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}

	sawOverconf := false
	for i := 0; i < 400; i++ {
		deck := g.buildDeck(profile, patterns, exclusions{}, db.TomorrowPrediction{})
		if len(deck) < 5 || len(deck) > 7 {
			t.Fatalf("deck length %d out of [5,7]", len(deck))
		}
		traps := 0
		overconf := false
		for _, f := range deck {
			if f.Type != "trap" {
				continue
			}
			traps++
			var p struct {
				Kind string `json:"kind"`
			}
			_ = json.Unmarshal([]byte(f.Payload), &p)
			if p.Kind == "overconfidence" {
				overconf = true
				// The estimate must be made before any game.
				if deck[0].Type != "trap" {
					t.Fatalf("overconfidence present but does not lead the deck: %v", deckTypes(deck))
				}
			}
		}
		if traps > 1 {
			t.Fatalf("more than one trap in a deck: %v", deckTypes(deck))
		}
		sawOverconf = sawOverconf || overconf
	}
	if !sawOverconf {
		t.Fatal("overconfidence estimate never appeared across 400 eligible decks")
	}
}

// The whole game depends on the rational move actually winning on screen. The
// library test guarantees it at the percentage level; this guarantees it still
// holds for the concrete amounts after rounding, across the entire stake band.
func TestOddsTrapsArePositiveEVAfterRounding(t *testing.T) {
	for _, tr := range signal.Traps {
		if tr.Stake.Kind != signal.StakeOdds {
			continue
		}
		for base := trapStakeMin; base <= trapStakeMax; base++ {
			gain := pctOf(base, tr.Stake.GainPct)
			loss := pctOf(base, tr.Stake.LossPct)
			// EV(risk) vs holding the pot, scaled by 100 to stay in integers.
			ev := tr.Stake.WinProb*(base+gain) + (100-tr.Stake.WinProb)*(base-loss)
			if ev <= base*100 {
				t.Errorf("%s @ base=%d: RISK not +EV after rounding (+%d/−%d, ev=%d, pot*100=%d)",
					tr.TrapID, base, gain, loss, ev, base*100)
			}
		}
	}
}

func TestBuildTrapFallsBackWhenAllServed(t *testing.T) {
	// Every eligible trap played yesterday — repeat rather than skip the beat.
	all := map[string]bool{}
	for _, tr := range signal.Traps {
		all[tr.TrapID] = true
	}
	if _, ok := buildTrap(db.ShadowProfile{CompileCount: 30, FragmentsDecoded: 10}, all); !ok {
		t.Fatal("buildTrap should fall back to a served trap, got !ok")
	}
}

func TestTrapGatedByCompileCount(t *testing.T) {
	g := &Generator{}
	// Below the unlock: a trap must never appear, no matter the coin flips.
	young := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: trapMinCompiles - 1}
	for i := 0; i < 200; i++ {
		for _, f := range g.buildDeck(young, nil, exclusions{}, db.TomorrowPrediction{}) {
			if f.Type == "trap" {
				t.Fatal("trap appeared before the compile-count unlock")
			}
		}
	}

	// Past the choice-trap unlock but before the overconfidence unlock (21): a
	// choice-trap appears on some nights, length stays 5–6, and the duel remains
	// the closer (the trap is a middle beat, never the climax).
	old := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 18}
	patterns := []db.PatternLibrary{namedPattern("the_approval_loop.process", 40)}
	sawTrap := false
	for i := 0; i < 300; i++ {
		deck := g.buildDeck(old, patterns, exclusions{}, db.TomorrowPrediction{})
		if len(deck) < 5 || len(deck) > 6 {
			t.Fatalf("deck length %d out of [5,6]", len(deck))
		}
		if deck[len(deck)-1].Type != "prediction_duel" {
			t.Fatalf("closer = %q, want prediction_duel", deck[len(deck)-1].Type)
		}
		traps := 0
		for _, f := range deck {
			if f.Type == "trap" {
				traps++
			}
		}
		if traps > 1 {
			t.Fatalf("more than one trap in a deck: %d", traps)
		}
		if traps == 1 {
			sawTrap = true
		}
	}
	if !sawTrap {
		t.Fatal("trap never appeared across 300 eligible decks")
	}
}

func TestUsedContentIDsCollectsTrap(t *testing.T) {
	frag, ok := buildTrap(db.ShadowProfile{CompileCount: 30, FragmentsDecoded: 11}, allTrapsExcept("loss_aversion_pot_001"))
	if !ok {
		t.Fatal("buildTrap !ok")
	}
	ex := usedContentIDs(&dynamo.DailyDeck{Fragments: []dynamo.Fragment{frag}})
	if !ex.trapIDs["loss_aversion_pot_001"] {
		t.Fatalf("trap_id not collected into exclusions: %v", ex.trapIDs)
	}
}
