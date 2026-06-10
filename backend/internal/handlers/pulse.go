package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

type getPulseTodayResponse struct {
	Completed   bool                   `json:"completed"`
	Stimulus    *pulseStimulusResponse `json:"stimulus,omitempty"`
	WordOptions []string               `json:"word_options,omitempty"`
}

type pulseStimulusResponse struct {
	StimulusID       string            `json:"stimulus_id"`
	Type             string            `json:"type"`
	Word             string            `json:"word,omitempty"`
	Left             string            `json:"left,omitempty"`
	Right            string            `json:"right,omitempty"`
	Scenario         string            `json:"scenario,omitempty"`
	DaemonPrediction string            `json:"daemon_prediction,omitempty"`
	DaemonObs        map[string]string `json:"daemon_observations"`
}

func (h *handler) GetPulseToday(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	item, err := h.ddb.GetPulse(r.Context(), userID.String())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load pulse")
		return
	}

	if item == nil {
		// No pulse generated yet for this user (pre-first-compile or outside run gate).
		respondWithJSON(w, http.StatusOK, getPulseTodayResponse{Completed: false})
		return
	}

	if item.CompletedAt != "" {
		respondWithJSON(w, http.StatusOK, getPulseTodayResponse{Completed: true})
		return
	}

	wordTexts := make([]string, len(item.WordOptions))
	for i, wo := range item.WordOptions {
		wordTexts[i] = wo.Word
	}

	s := item.Stimulus
	respondWithJSON(w, http.StatusOK, getPulseTodayResponse{
		Completed: false,
		Stimulus: &pulseStimulusResponse{
			StimulusID:       s.StimulusID,
			Type:             s.Type,
			Word:             s.Word,
			Left:             s.Left,
			Right:            s.Right,
			Scenario:         s.Scenario,
			DaemonPrediction: s.DaemonPrediction,
			DaemonObs:        s.DaemonObs,
		},
		WordOptions: wordTexts,
	})
}

type postPulseResponseRequest struct {
	StimulusID   string  `json:"stimulus_id"`
	StimulusType string  `json:"stimulus_type"`
	ResultBucket string  `json:"result_bucket"`
	DurationMs   int     `json:"duration_ms"`
	WordSelected *string `json:"word_selected"`
}

func (h *handler) PostPulseResponse(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req postPulseResponseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.StimulusID == "" || req.StimulusType == "" || req.ResultBucket == "" {
		respondWithError(w, http.StatusBadRequest, "stimulus_id, stimulus_type, and result_bucket required")
		return
	}

	responseData, _ := json.Marshal(map[string]interface{}{
		"source":        "pulse",
		"stimulus_id":   req.StimulusID,
		"stimulus_type": req.StimulusType,
		"result_bucket": req.ResultBucket,
		"duration_ms":   req.DurationMs,
		"word_selected": req.WordSelected,
	})

	today := pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}
	if err := h.q.InsertCardResponse(r.Context(), db.InsertCardResponseParams{
		UserID:       userID,
		FragmentID:   req.StimulusID,
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
