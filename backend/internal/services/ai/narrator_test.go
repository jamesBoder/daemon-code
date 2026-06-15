package ai

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNamingLine_HumanizesProcessName(t *testing.T) {
	got := namingLine("the_yes_that_costs.process")
	if strings.Contains(got, "_") || strings.Contains(got, ".process") {
		t.Fatalf("naming line still contains raw name artifacts: %q", got)
	}
	if !strings.Contains(got, "the yes that costs") {
		t.Fatalf("naming line missing humanized name: %q", got)
	}
}

func TestFirstNamedProcess(t *testing.T) {
	tests := []struct {
		name string
		diff []processDiffEntry
		want string
	}{
		{
			name: "returns first named, skipping non-named",
			diff: []processDiffEntry{
				{Name: "the_floor.process", Change: "strength_up"},
				{Name: "the_yes_that_costs.process", Change: "named"},
				{Name: "the_other.process", Change: "named"},
			},
			want: "the_yes_that_costs.process",
		},
		{
			name: "no named entries returns empty",
			diff: []processDiffEntry{{Name: "x.process", Change: "strength_down"}},
			want: "",
		},
		{
			name: "named with empty name is ignored",
			diff: []processDiffEntry{{Name: "", Change: "named"}},
			want: "",
		},
		{
			name: "empty diff returns empty",
			diff: nil,
			want: "",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			raw, _ := json.Marshal(tc.diff)
			if got := firstNamedProcess(raw); got != tc.want {
				t.Fatalf("firstNamedProcess = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestFirstNamedProcess_MalformedJSON(t *testing.T) {
	if got := firstNamedProcess(json.RawMessage(`{not valid`)); got != "" {
		t.Fatalf("malformed diff should yield empty, got %q", got)
	}
}

func TestNormalizeRecentDiff(t *testing.T) {
	tests := map[string]struct {
		in   string
		want string
	}{
		"null collapses to empty": {in: "null", want: ""},
		"empty stays empty":       {in: "", want: ""},
		"array passes through":    {in: `[{"id":"1","name":"x","change":"named"}]`, want: `[{"id":"1","name":"x","change":"named"}]`},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			if got := normalizeRecentDiff(json.RawMessage(tc.in)); got != tc.want {
				t.Fatalf("normalizeRecentDiff(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
