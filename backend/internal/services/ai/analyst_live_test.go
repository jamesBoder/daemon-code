package ai

import (
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/db"
)

func TestDeriveNewPatternStrength(t *testing.T) {
	tests := []struct {
		name  string
		delta int
		want  int32
	}{
		{"faint signal floors, not zero", 0, newPatternStrengthMin},
		{"negative clamps to floor", -20, newPatternStrengthMin},
		{"mid signal passes through", 20, 20},
		{"strong signal caps at ceiling", 999, newPatternStrengthMax},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := deriveNewPatternStrength(tt.delta); got != tt.want {
				t.Errorf("deriveNewPatternStrength(%d) = %d, want %d", tt.delta, got, tt.want)
			}
		})
	}
}

func TestFindProvisionalBySignalKey(t *testing.T) {
	named := db.PatternLibrary{
		ID:        uuid.New(),
		Name:      pgtype.Text{String: "the_approval_loop.process", Valid: true},
		Unnamed:   false,
		SignalKey: "approach_avoidance:high",
	}
	provisional := db.PatternLibrary{
		ID:        uuid.New(),
		Unnamed:   true,
		SignalKey: "conscientiousness:low",
	}
	noKey := db.PatternLibrary{ID: uuid.New(), Unnamed: true, SignalKey: ""}
	patterns := []db.PatternLibrary{named, provisional, noKey}

	// Matches the unnamed seed by signal_key.
	got, ok := findProvisionalBySignalKey(patterns, "conscientiousness:low")
	if !ok || got.ID != provisional.ID {
		t.Errorf("expected provisional match, got ok=%v id=%v", ok, got.ID)
	}

	// Does not match a NAMED pattern even on the same key — only unnamed seeds promote.
	if _, ok := findProvisionalBySignalKey(patterns, "approach_avoidance:high"); ok {
		t.Errorf("named pattern should not be treated as a provisional seed")
	}

	// Empty key never matches the keyless unnamed row.
	if _, ok := findProvisionalBySignalKey(patterns, ""); ok {
		t.Errorf("empty signal_key must not match")
	}
}

func TestToExistingPatternsProjectsName(t *testing.T) {
	patterns := []db.PatternLibrary{
		{ID: uuid.New(), Name: pgtype.Text{String: "x.process", Valid: true}, State: "running", Strength: 40, SignalKey: "openness:high"},
		{ID: uuid.New(), Unnamed: true, State: "new", Strength: 12, SignalKey: "neuroticism:high"},
	}
	got := toExistingPatterns(patterns)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2", len(got))
	}
	if got[0].Name != "x.process" || got[0].Strength != 40 {
		t.Errorf("named projection wrong: %+v", got[0])
	}
	if got[1].Name != "" || !got[1].Unnamed {
		t.Errorf("unnamed projection should have empty name: %+v", got[1])
	}
}
