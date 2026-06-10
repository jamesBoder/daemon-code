package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

const (
	maxMapConnections = 3
	mapNodeCount      = 6
	centerNodeID      = "center" // reserved ID for the scenario anchor

	// maxPlausibleDurationMs caps client-reported timings — these values feed
	// the Analyst, so junk is rejected rather than recorded.
	maxPlausibleDurationMs = 30 * 60 * 1000
)

type pulseScenarioResponse struct {
	ScenarioID       string `json:"scenario_id"`
	Type             string `json:"type"`
	Text             string `json:"text"`
	DaemonObs        string `json:"daemon_observation"`
	DaemonPrediction string `json:"daemon_prediction"`
}

type pulseNodeResponse struct {
	NodeID string `json:"node_id"`
	Text   string `json:"text"`
}

type getPulseTodayResponse struct {
	Completed bool                   `json:"completed"`
	Scenario  *pulseScenarioResponse `json:"scenario,omitempty"`
	Nodes     []pulseNodeResponse    `json:"nodes,omitempty"`
}

func (h *handler) GetPulseToday(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	item, err := h.ddb.GetPulse(r.Context(), userID.String())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load pulse")
		return
	}

	// No item (pre-first-compile / outside run gate), or an old-schema
	// stimulus item from the deploy window (no scenario field) — both read
	// as not-found. Old items expire within the 26h TTL.
	if item == nil || item.Scenario.ScenarioID == "" {
		respondWithJSON(w, http.StatusOK, getPulseTodayResponse{Completed: false})
		return
	}

	if item.CompletedAt != "" {
		respondWithJSON(w, http.StatusOK, getPulseTodayResponse{Completed: true})
		return
	}

	// Dimension tags are server-only — strip before responding.
	nodes := make([]pulseNodeResponse, 0, len(item.Nodes))
	for _, n := range item.Nodes {
		nodes = append(nodes, pulseNodeResponse{NodeID: n.NodeID, Text: n.Text})
	}

	respondWithJSON(w, http.StatusOK, getPulseTodayResponse{
		Completed: false,
		Scenario: &pulseScenarioResponse{
			ScenarioID:       item.Scenario.ScenarioID,
			Type:             item.Scenario.Type,
			Text:             item.Scenario.Text,
			DaemonObs:        item.Scenario.DaemonObs,
			DaemonPrediction: item.Scenario.DaemonPrediction,
		},
		Nodes: nodes,
	})
}

type pulseConnection struct {
	A string `json:"a"`
	B string `json:"b"`
}

type postPulseResponseRequest struct {
	ScenarioID       string            `json:"scenario_id"`
	Connections      []pulseConnection `json:"connections"`
	IsolatedNodes    []string          `json:"isolated_nodes"`
	FirstWireDelayMs *int64            `json:"first_wire_delay_ms"`
	DurationMs       int64             `json:"duration_ms"`
}

func (h *handler) PostPulseResponse(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req postPulseResponseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ScenarioID == "" {
		respondWithError(w, http.StatusBadRequest, "scenario_id required")
		return
	}

	item, err := h.ddb.GetPulse(r.Context(), userID.String())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load pulse")
		return
	}
	// Item gone (TTL-edge play) or replaced (session straddling the nightly
	// regeneration) — nothing valid to record against. The client is
	// fire-and-forget and proceeds to Phase 4 regardless.
	if item == nil || item.Scenario.ScenarioID == "" || item.Scenario.ScenarioID != req.ScenarioID {
		respondWithError(w, http.StatusConflict, "scenario no longer current")
		return
	}

	if msg, ok := validateMapResponse(&req, item); !ok {
		respondWithError(w, http.StatusBadRequest, msg)
		return
	}

	responseData, _ := json.Marshal(map[string]interface{}{
		"source":              "pulse",
		"scenario_id":         req.ScenarioID,
		"connections":         req.Connections,
		"isolated_nodes":      req.IsolatedNodes,
		"first_wire_delay_ms": req.FirstWireDelayMs,
		"duration_ms":         req.DurationMs,
	})

	today := pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}
	if err := h.q.InsertCardResponse(r.Context(), db.InsertCardResponseParams{
		UserID:       userID,
		FragmentID:   req.ScenarioID, // = scenario_id, so the 14-day repeat gap works unchanged
		FragmentType: "pulse",
		ResponseData: responseData,
		SessionDate:  today,
	}); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not save response")
		return
	}

	// Mark pulse completed in DynamoDB. Non-fatal if it fails — the card_responses row
	// is the source of truth; DynamoDB completed_at is a display cache.
	_ = h.ddb.SetPulseCompleted(r.Context(), userID.String())

	w.WriteHeader(http.StatusNoContent)
}

// validateMapResponse enforces the Map response invariants. Connections feed
// the Analyst — junk is rejected, not recorded.
func validateMapResponse(req *postPulseResponseRequest, item *dynamo.PulseItem) (string, bool) {
	validIDs := make(map[string]bool, mapNodeCount+1)
	for _, n := range item.Nodes {
		validIDs[n.NodeID] = true
	}
	validIDs[centerNodeID] = true

	if len(req.Connections) > maxMapConnections {
		return "too many connections", false
	}

	// Wires are unordered pairs — a–b and b–a are the same wire.
	pairKey := func(a, b string) string {
		if a > b {
			a, b = b, a
		}
		return a + "|" + b
	}
	seenPairs := make(map[string]bool, len(req.Connections))
	wired := make(map[string]bool, mapNodeCount+1)
	for _, c := range req.Connections {
		if !validIDs[c.A] || !validIDs[c.B] {
			return "unknown node id in connections", false
		}
		if c.A == c.B {
			return "connection endpoints must differ", false
		}
		key := pairKey(c.A, c.B)
		if seenPairs[key] {
			return "duplicate connection", false
		}
		seenPairs[key] = true
		wired[c.A] = true
		wired[c.B] = true
	}

	// Cross-field consistency: every ID is either wired or isolated, never
	// both or neither — connections + isolated_nodes account for exactly the
	// 7 IDs (6 nodes + center).
	isolated := make(map[string]bool, len(req.IsolatedNodes))
	for _, id := range req.IsolatedNodes {
		if !validIDs[id] {
			return "unknown node id in isolated_nodes", false
		}
		if isolated[id] {
			return "duplicate isolated node", false
		}
		if wired[id] {
			return "node cannot be both wired and isolated", false
		}
		isolated[id] = true
	}
	if len(wired)+len(isolated) != len(validIDs) {
		return "connections and isolated_nodes must account for all nodes", false
	}

	// Timing sanity — these values feed the Analyst.
	if req.DurationMs < 0 || req.DurationMs > maxPlausibleDurationMs {
		return "duration_ms out of bounds", false
	}
	if req.FirstWireDelayMs != nil {
		d := *req.FirstWireDelayMs
		if d < 0 || d > req.DurationMs {
			return "first_wire_delay_ms out of bounds", false
		}
	}

	return "", true
}
