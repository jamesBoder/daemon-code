package handlers

import (
	"net/http"

	"github.com/jamesboder/daemon-code/internal/middleware"
)

func (h *handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	profile, err := h.q.GetShadowProfile(r.Context(), userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load profile")
		return
	}

	respondWithJSON(w, http.StatusOK, profile)
}
