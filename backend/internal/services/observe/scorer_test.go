package observe

import (
	"strings"
	"testing"
)

func TestReinforcement(t *testing.T) {
	tests := []struct {
		name    string
		dir     string
		sig     float64
		wantOK  bool
		wantMag float64
	}{
		{"high fully reinforced", "high", 1.0, true, 1.0},
		{"high half reinforced", "high", 0.75, true, 0.5},
		{"high at neutral is noise", "high", 0.5, false, 0},
		{"high below margin is noise", "high", 0.55, false, 0},
		{"high opposite direction", "high", 0.2, false, 0},
		{"low fully reinforced", "low", 0.0, true, 1.0},
		{"low half reinforced", "low", 0.25, true, 0.5},
		{"low below margin is noise", "low", 0.45, false, 0},
		{"bad direction", "sideways", 0.9, false, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mag, ok := reinforcement(tt.dir, tt.sig)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if ok && mag != tt.wantMag {
				t.Fatalf("mag = %v, want %v", mag, tt.wantMag)
			}
		})
	}
}

func TestDeriveDeltaScalesWithMagnitudeWithinCap(t *testing.T) {
	// A faint reinforcement still registers (+1); a strong one moves the full cap.
	if got := deriveDelta(0); got != 1 {
		t.Errorf("deriveDelta(0) = %d, want 1", got)
	}
	if got := deriveDelta(1); got != maxPerSessionDelta {
		t.Errorf("deriveDelta(1) = %d, want %d", got, maxPerSessionDelta)
	}
	// Monotonic and never above the per-session cap, never below 1.
	prev := 0
	for _, mag := range []float64{0, 0.25, 0.5, 0.75, 1.0} {
		d := deriveDelta(mag)
		if d < 1 || d > maxPerSessionDelta {
			t.Errorf("deriveDelta(%v) = %d, out of [1,%d]", mag, d, maxPerSessionDelta)
		}
		if d < prev {
			t.Errorf("deriveDelta not monotonic at mag=%v: %d < %d", mag, d, prev)
		}
		prev = d
	}
}

func TestDeriveSeedStrengthWithinBand(t *testing.T) {
	if got := deriveSeedStrength(0); got != seedStrengthMin {
		t.Errorf("deriveSeedStrength(0) = %d, want %d", got, seedStrengthMin)
	}
	if got := deriveSeedStrength(1); got != seedStrengthMax {
		t.Errorf("deriveSeedStrength(1) = %d, want %d", got, seedStrengthMax)
	}
}

func TestParseSignalKey(t *testing.T) {
	tests := []struct {
		key              string
		wantDim, wantDir string
		wantOK           bool
	}{
		{"approach_avoidance:high", "approach_avoidance", "high", true},
		{"conscientiousness:low", "conscientiousness", "low", true},
		{"openness:sideways", "", "", false},
		{":high", "", "", false},
		{"no_colon", "", "", false},
		{"", "", "", false},
	}
	for _, tt := range tests {
		dim, dir, ok := parseSignalKey(tt.key)
		if ok != tt.wantOK || dim != tt.wantDim || dir != tt.wantDir {
			t.Errorf("parseSignalKey(%q) = (%q,%q,%v), want (%q,%q,%v)",
				tt.key, dim, dir, ok, tt.wantDim, tt.wantDir, tt.wantOK)
		}
	}
}

func TestComposeLineVariesByOutcome(t *testing.T) {
	d := 3
	moved := []Move{{ID: "1", Name: "the_approval_loop.process", Change: "strength_up", Delta: &d}}

	// A moved named process is referenced by name.
	if got := composeLine(moved, false, 4); !strings.Contains(got, "the_approval_loop.process") {
		t.Errorf("moved line should name the process, got %q", got)
	}
	// No movement but a seed → forming language, no format verb leakage.
	seeded := composeLine(nil, true, 4)
	if strings.Contains(seeded, "%!") {
		t.Errorf("forming line leaked a format verb: %q", seeded)
	}
	// Nothing at all early → patient language.
	patient := composeLine(nil, false, 1)
	if patient == "" || strings.Contains(patient, "%!") {
		t.Errorf("patient line malformed: %q", patient)
	}
	// Established user, quiet night → "watching", never new-user patience.
	watching := composeLine(nil, false, establishedSessions)
	for _, p := range patientLines {
		if watching == p {
			t.Errorf("established user got a new-user patient line: %q", watching)
		}
	}
	// Varies across sessions (not one fixed string).
	if composeLine(nil, false, 1) == composeLine(nil, false, 2) {
		t.Errorf("patient line should vary across sessions")
	}
}

func TestComposeLinePicksStrongestNamedMove(t *testing.T) {
	d2, d4 := 2, 4
	moves := []Move{
		{ID: "1", Name: "weak.process", Change: "strength_up", Delta: &d2},
		{ID: "2", Name: "strong.process", Change: "strength_up", Delta: &d4},
	}
	if got := composeLine(moves, false, 0); !strings.Contains(got, "strong.process") {
		t.Errorf("should reference the strongest move, got %q", got)
	}
}
