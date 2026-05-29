package handlers

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

func (h *handler) GetProcesses(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	patterns, err := h.q.GetPatternLibrary(r.Context(), userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load processes")
		return
	}

	respondWithJSON(w, http.StatusOK, patterns)
}

func (h *handler) GetProcess(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid process id")
		return
	}

	userID := middleware.UserIDFromContext(r.Context())

	patterns, err := h.q.GetPatternLibrary(r.Context(), userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load processes")
		return
	}

	for _, p := range patterns {
		if p.ID == id {
			respondWithJSON(w, http.StatusOK, p)
			return
		}
	}

	respondWithError(w, http.StatusNotFound, "process not found")
}
