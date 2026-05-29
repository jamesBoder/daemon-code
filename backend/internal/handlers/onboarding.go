package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jamesboder/daemon-code/internal/middleware"
)

type onboardingRequest struct {
	Responses json.RawMessage `json:"responses"`
}

func (h *handler) OnboardingComplete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req onboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.q.UpdateOnboardingComplete(r.Context(), userID); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not complete onboarding")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]bool{"onboarding_complete": true})
}
