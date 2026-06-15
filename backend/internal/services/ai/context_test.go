package ai

import (
	"encoding/json"
	"testing"

	"github.com/jamesboder/daemon-code/internal/db"
)

func speedRoundResponse(t *testing.T, results []srResultItem) db.CardResponse {
	t.Helper()
	rd, err := json.Marshal(results)
	if err != nil {
		t.Fatal(err)
	}
	return db.CardResponse{FragmentType: "speed_round", ResponseData: rd}
}

func TestComputeDimensionSignalsSpeedRound(t *testing.T) {
	responses := []db.CardResponse{
		speedRoundResponse(t, []srResultItem{
			// "defensive" is tagged grim_trigger 0.70 + agreeableness 0.30 in signal.SpeedPrompts.
			{Starter: "Criticism makes me...", Chosen: "defensive", ResponseTimeMs: 900},
			// Unknown starters (stale client, removed prompt) must contribute nothing.
			{Starter: "not a real starter...", Chosen: "defensive", ResponseTimeMs: 700},
		}),
	}

	out := computeDimensionSignals(responses, nil)

	grim, ok := out["grim_trigger"].(map[string]interface{})
	if !ok {
		t.Fatalf("grim_trigger signal missing from %v", out)
	}
	if grim["signal"] != 0.7 {
		t.Fatalf("grim_trigger signal = %v, want 0.7", grim["signal"])
	}
	if _, ok := out["k_level"]; ok {
		t.Fatal("k_level signal appeared without any tagged response")
	}
}

func TestComputeDimensionSignalsSpeedRoundMalformed(t *testing.T) {
	responses := []db.CardResponse{
		{FragmentType: "speed_round", ResponseData: []byte(`not json`)},
	}
	out := computeDimensionSignals(responses, nil)
	if len(out) != 0 {
		t.Fatalf("malformed response produced signals: %v", out)
	}
}
