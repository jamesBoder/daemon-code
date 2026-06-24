package handlers

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

// strengthMax is the upper bound for a process strength bar (percent).
const strengthMax int32 = 100

func (h *handler) GetProcesses(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	patterns, err := h.q.GetPatternLibrary(r.Context(), userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load processes")
		return
	}

	for i := range patterns {
		patterns[i] = forClient(patterns[i])
	}

	respondWithJSON(w, http.StatusOK, patterns)
}

// forClient prepares a pattern for the API: it folds the provisional live drift
// into a single effective strength (no frontend math) and strips the daemon's
// internal reconciliation state — the signal_key fingerprint and raw live_delta
// are mechanism the daemon keeps to itself, never shipped to the client.
func forClient(p db.PatternLibrary) db.PatternLibrary {
	p.Strength = effectiveStrength(p)
	p.LiveDelta = 0
	p.SignalKey = ""
	return p
}

// effectiveStrength clamps base strength plus live drift into [0, 100].
func effectiveStrength(p db.PatternLibrary) int32 {
	s := p.Strength + p.LiveDelta
	if s < 0 {
		return 0
	}
	if s > strengthMax {
		return strengthMax
	}
	return s
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
			respondWithJSON(w, http.StatusOK, forClient(p))
			return
		}
	}

	respondWithError(w, http.StatusNotFound, "process not found")
}
