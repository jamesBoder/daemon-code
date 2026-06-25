package signal

import "testing"

func TestTrapLibraryIntegrity(t *testing.T) {
	seenIDs := map[string]bool{}
	for _, tr := range Traps {
		if tr.TrapID == "" || seenIDs[tr.TrapID] {
			t.Fatalf("trap %q: missing or duplicate TrapID", tr.Scenario)
		}
		seenIDs[tr.TrapID] = true

		if tr.Bias != BiasLossAversion && tr.Bias != BiasSunkCost {
			t.Fatalf("trap %q: unknown bias %q", tr.TrapID, tr.Bias)
		}
		if tr.Stake.Kind != StakeOdds && tr.Stake.Kind != StakeSunk {
			t.Fatalf("trap %q: unknown stake kind %q", tr.TrapID, tr.Stake.Kind)
		}

		// Bias and rational choices must be distinct, present, and tagged only
		// with valid dimensions in [0,1].
		if tr.BiasChoice.ID == "" || tr.RationalChoice.ID == "" || tr.BiasChoice.ID == tr.RationalChoice.ID {
			t.Fatalf("trap %q: choice IDs missing or identical", tr.TrapID)
		}
		for _, c := range []TrapChoice{tr.BiasChoice, tr.RationalChoice} {
			for dim, sig := range c.DimensionSignals {
				if !validDimensions[dim] {
					t.Fatalf("trap %q choice %q: unknown dimension %q", tr.TrapID, c.ID, dim)
				}
				if sig < 0 || sig > 1 {
					t.Fatalf("trap %q choice %q: signal %v out of [0,1]", tr.TrapID, c.ID, sig)
				}
			}
		}

		// The whole game depends on the rational move actually being better.
		switch tr.Stake.Kind {
		case StakeOdds:
			if tr.Stake.WinProb < 1 || tr.Stake.WinProb > 99 {
				t.Fatalf("trap %q: WinProb %d out of (0,100)", tr.TrapID, tr.Stake.WinProb)
			}
			// EV(RISK) as a percent of the pot vs holding the pot (100%).
			ev := tr.Stake.WinProb*(100+tr.Stake.GainPct) + (100-tr.Stake.WinProb)*(100-tr.Stake.LossPct)
			if ev <= 100*100 {
				t.Fatalf("trap %q: RISK is not +EV (ev/100 = %d%%, want > 100%%)", tr.TrapID, ev/100)
			}
		case StakeSunk:
			if tr.Stake.AbandonPct <= tr.Stake.ContinuePct {
				t.Fatalf("trap %q: ABANDON (%d) must return more than CONTINUE (%d)",
					tr.TrapID, tr.Stake.AbandonPct, tr.Stake.ContinuePct)
			}
		}
	}
}

func TestLookupTrapAndChoice(t *testing.T) {
	tr, ok := LookupTrap("loss_aversion_pot_001")
	if !ok {
		t.Fatal("known trap not found")
	}
	if _, ok := LookupTrap("nope"); ok {
		t.Fatal("unknown trap reported found")
	}

	// The bait choice resolves as bias-aligned; the rational one does not.
	if _, aligned, ok := tr.TrapChoiceByID("hold"); !ok || !aligned {
		t.Fatalf("hold should resolve bias-aligned (ok=%v aligned=%v)", ok, aligned)
	}
	if _, aligned, ok := tr.TrapChoiceByID("risk"); !ok || aligned {
		t.Fatalf("risk should resolve non-aligned (ok=%v aligned=%v)", ok, aligned)
	}
	if _, _, ok := tr.TrapChoiceByID("bogus"); ok {
		t.Fatal("unknown choice reported found")
	}
}
