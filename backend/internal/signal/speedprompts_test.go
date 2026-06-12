package signal

import "testing"

// profile_dimensions schema names — the only valid DimensionSignals keys.
var validDimensions = map[string]bool{
	"openness":           true,
	"conscientiousness":  true,
	"agreeableness":      true,
	"neuroticism":        true,
	"locus_of_control":   true,
	"approach_avoidance": true,
	"temporal_focus":     true,
	"discount_factor":    true,
	"grim_trigger":       true,
	"k_level":            true,
}

func TestSpeedPromptLibraryIntegrity(t *testing.T) {
	seenIDs := map[string]bool{}
	seenStarters := map[string]bool{}

	for _, p := range SpeedPrompts {
		if p.PromptID == "" || seenIDs[p.PromptID] {
			t.Fatalf("prompt %q: missing or duplicate PromptID", p.Starter)
		}
		seenIDs[p.PromptID] = true

		if seenStarters[p.Starter] {
			t.Fatalf("duplicate starter %q breaks LookupSpeedOption", p.Starter)
		}
		seenStarters[p.Starter] = true

		if len(p.Options) < 2 {
			t.Fatalf("prompt %q has %d options, want >= 2", p.PromptID, len(p.Options))
		}
		seenTexts := map[string]bool{}
		for _, o := range p.Options {
			if o.Text == "" || seenTexts[o.Text] {
				t.Fatalf("prompt %q: missing or duplicate option text %q", p.PromptID, o.Text)
			}
			seenTexts[o.Text] = true
			for dim, sig := range o.DimensionSignals {
				if !validDimensions[dim] {
					t.Fatalf("prompt %q option %q: unknown dimension %q", p.PromptID, o.Text, dim)
				}
				if sig < 0 || sig > 1 {
					t.Fatalf("prompt %q option %q: signal %v out of [0,1]", p.PromptID, o.Text, sig)
				}
			}
		}
	}
}

func TestLookupSpeedOption(t *testing.T) {
	opt, ok := LookupSpeedOption("Criticism makes me...", "curious")
	if !ok {
		t.Fatal("known starter/option not found")
	}
	if opt.DimensionSignals["openness"] == 0 {
		t.Fatal("expected openness signal on 'curious'")
	}

	if _, ok := LookupSpeedOption("Criticism makes me...", "not an option"); ok {
		t.Fatal("unknown option reported found")
	}
	if _, ok := LookupSpeedOption("not a starter", "curious"); ok {
		t.Fatal("unknown starter reported found")
	}
}
