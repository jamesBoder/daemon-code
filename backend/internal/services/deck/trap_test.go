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

func TestBuildTrapOddsPayload(t *testing.T) {
	profile := db.ShadowProfile{CompileCount: 30, FragmentsDecoded: 11}
	frag, ok := buildTrap(profile, allTrapsExcept("loss_aversion_pot_001"))
	if !ok || frag.Type != "trap" {
		t.Fatalf("buildTrap ok=%v type=%q", ok, frag.Type)
	}
	var p struct {
		TrapID   string `json:"trap_id"`
		Kind     string `json:"kind"`
		Scenario string `json:"scenario"`
		Stake    int    `json:"stake"`
		WinProb  int    `json:"win_prob"`
		ChoiceA  struct {
			ID, Sub string
		} `json:"choice_a"`
		ChoiceB struct {
			ID, Sub string
		} `json:"choice_b"`
	}
	if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
		t.Fatal(err)
	}
	if p.TrapID != "loss_aversion_pot_001" || p.Kind != "odds" {
		t.Fatalf("unexpected trap %+v", p)
	}
	if p.Stake != 11 || p.WinProb != 70 {
		t.Errorf("stake=%d win_prob=%d, want 11 / 70", p.Stake, p.WinProb)
	}
	if p.ChoiceA.ID != "hold" || p.ChoiceB.ID != "risk" {
		t.Errorf("choice ids = %q / %q, want hold / risk", p.ChoiceA.ID, p.ChoiceB.ID)
	}
	// The personalized number must land in the scenario, and the risk payoff must
	// be on screen (the "math is visible" promise).
	if !strings.Contains(p.Scenario, "11") {
		t.Errorf("scenario missing personalized stake: %q", p.Scenario)
	}
	if !strings.HasPrefix(p.ChoiceB.Sub, "+") {
		t.Errorf("risk sub missing payoff: %q", p.ChoiceB.Sub)
	}
	// Dimension tags must never reach the client.
	if strings.Contains(frag.Payload, "approach_avoidance") || strings.Contains(frag.Payload, "dimension") {
		t.Errorf("payload leaked server-only tags: %s", frag.Payload)
	}
}

func TestBuildTrapSunkPayload(t *testing.T) {
	profile := db.ShadowProfile{CompileCount: 30, FragmentsDecoded: 12}
	frag, ok := buildTrap(profile, allTrapsExcept("sunk_cost_path_001"))
	if !ok {
		t.Fatal("buildTrap returned !ok")
	}
	var p struct {
		Kind    string `json:"kind"`
		Sunk    int    `json:"sunk"`
		ChoiceA struct {
			ID, Sub string
		} `json:"choice_a"`
		ChoiceB struct {
			ID, Sub string
		} `json:"choice_b"`
	}
	if err := json.Unmarshal([]byte(frag.Payload), &p); err != nil {
		t.Fatal(err)
	}
	if p.Kind != "sunk" || p.Sunk != 12 {
		t.Errorf("kind=%q sunk=%d, want sunk / 12", p.Kind, p.Sunk)
	}
	if p.ChoiceA.ID != "continue" || p.ChoiceB.ID != "abandon" {
		t.Errorf("choice ids = %q / %q, want continue / abandon", p.ChoiceA.ID, p.ChoiceB.ID)
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

	// At/after the unlock: it appears on some nights, length stays 5–6, and the
	// duel remains the closer (the trap is a middle beat, never the climax).
	old := db.ShadowProfile{PrimaryArchetype: "default", CompileCount: 30}
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
