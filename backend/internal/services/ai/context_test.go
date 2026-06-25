package ai

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
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

func trapResponse(t *testing.T, trapID, choice string) db.CardResponse {
	t.Helper()
	rd, err := json.Marshal(trapResultData{TrapID: trapID, Choice: choice, ResponseTimeMs: 4200})
	if err != nil {
		t.Fatal(err)
	}
	return db.CardResponse{FragmentType: "trap", ResponseData: rd}
}

func TestComputeDimensionSignalsTrap(t *testing.T) {
	// Taking the bait (hold) on loss_aversion_pot_001 tags approach_avoidance low.
	out := computeDimensionSignals([]db.CardResponse{
		trapResponse(t, "loss_aversion_pot_001", "hold"),
	}, nil)

	aa, ok := out["approach_avoidance"].(map[string]interface{})
	if !ok {
		t.Fatalf("approach_avoidance signal missing from %v", out)
	}
	if aa["signal"] != 0.2 {
		t.Fatalf("approach_avoidance signal = %v, want 0.2 (avoidance/bait)", aa["signal"])
	}

	// Unknown trap / choice must contribute nothing.
	if len(computeDimensionSignals([]db.CardResponse{trapResponse(t, "nope", "hold")}, nil)) != 0 {
		t.Fatal("unknown trap produced signals")
	}
	if len(computeDimensionSignals([]db.CardResponse{trapResponse(t, "loss_aversion_pot_001", "bogus")}, nil)) != 0 {
		t.Fatal("unknown choice produced signals")
	}
}

func TestComputeTrapSignals(t *testing.T) {
	// 3 loss_aversion (2 bait, 1 rational) + 3 sunk_cost (all rational).
	recent := []db.CardResponse{
		trapResponse(t, "loss_aversion_pot_001", "hold"), // bait
		trapResponse(t, "loss_aversion_pot_002", "hold"), // bait
		trapResponse(t, "loss_aversion_pot_003", "risk"), // rational
		trapResponse(t, "sunk_cost_path_001", "abandon"), // rational
		trapResponse(t, "sunk_cost_path_002", "abandon"), // rational
		trapResponse(t, "sunk_cost_path_003", "abandon"), // rational
	}
	out := computeTrapSignals(recent)
	if out == nil {
		t.Fatal("expected trap_signals, got nil")
	}

	la, ok := out["loss_aversion"].(map[string]interface{})
	if !ok || la["n"] != 3 || la["alignment_rate"] != round2(2.0/3.0) {
		t.Fatalf("loss_aversion = %v, want n=3 rate=%v", out["loss_aversion"], round2(2.0/3.0))
	}
	sc, ok := out["sunk_cost"].(map[string]interface{})
	if !ok || sc["n"] != 3 || sc["alignment_rate"] != 0.0 {
		t.Fatalf("sunk_cost = %v, want n=3 rate=0", out["sunk_cost"])
	}
	comp, ok := out["composite"].(map[string]interface{})
	if !ok || comp["n"] != 6 || comp["rational_rate"] != round2(4.0/6.0) {
		t.Fatalf("composite = %v, want n=6 rational=%v", out["composite"], round2(4.0/6.0))
	}
}

func dated(t *testing.T, date string, frags ...db.CardResponse) []db.CardResponse {
	t.Helper()
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		t.Fatal(err)
	}
	for i := range frags {
		frags[i].SessionDate = pgtype.Date{Time: d, Valid: true}
	}
	return frags
}

func estimateResponse(t *testing.T, predicted int) db.CardResponse {
	t.Helper()
	rd, err := json.Marshal(trapResultData{TrapID: "overconfidence_estimate", Predicted: &predicted})
	if err != nil {
		t.Fatal(err)
	}
	return db.CardResponse{FragmentType: "trap", ResponseData: rd}
}

func gameRow() db.CardResponse {
	return db.CardResponse{FragmentType: "reaction_test", ResponseData: []byte(`[]`)}
}

func TestComputeOverconfidenceSignal(t *testing.T) {
	var recent []db.CardResponse
	// 3 sessions: each predicts 10, completes 5 game fragments (+ the estimate row).
	// actual = nonPulse(6) - 1 = 5; error = +5 each → lean "over".
	for _, date := range []string{"2026-06-21", "2026-06-22", "2026-06-23"} {
		rows := []db.CardResponse{estimateResponse(t, 10), gameRow(), gameRow(), gameRow(), gameRow(), gameRow()}
		recent = append(recent, dated(t, date, rows...)...)
	}
	out := computeOverconfidenceSignal(recent)
	if out == nil {
		t.Fatal("expected overconfidence_signal, got nil")
	}
	if out["n"] != 3 || out["mean_error"] != 5.0 || out["lean"] != "over" {
		t.Fatalf("got %v, want n=3 mean_error=5 lean=over", out)
	}

	// Below the sample floor → nil. Also: a pulse row must not count toward actual.
	one := dated(t, "2026-06-24",
		estimateResponse(t, 6), gameRow(), gameRow(),
		db.CardResponse{FragmentType: "pulse", ResponseData: []byte(`{}`)},
	)
	if computeOverconfidenceSignal(one) != nil {
		t.Fatal("expected nil below sample floor")
	}
}

func TestComputeTrapSignalsBelowThreshold(t *testing.T) {
	// Two trap responses total is below trapBiasMinSamples — nothing surfaces.
	out := computeTrapSignals([]db.CardResponse{
		trapResponse(t, "loss_aversion_pot_001", "hold"),
		trapResponse(t, "loss_aversion_pot_002", "hold"),
	})
	if out != nil {
		t.Fatalf("expected nil below threshold, got %v", out)
	}
}
