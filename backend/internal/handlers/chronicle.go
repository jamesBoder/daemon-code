package handlers

import (
	"net/http"

	"github.com/jamesboder/daemon-code/internal/middleware"
)

const chroniclePageLimit = 60 // max entries returned per request

type chronicleEntry struct {
	Date         string `json:"date"`
	Day          int    `json:"day"`
	OrbState     string `json:"orbState,omitempty"`
	Prose        string `json:"prose"`
	ShadowPrompt string `json:"shadowPrompt,omitempty"`
	SignalQuote  string `json:"signalQuote,omitempty"`
	SignalAuthor string `json:"signalAuthor,omitempty"`
}

func (h *handler) GetChronicle(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	states, err := h.ddb.GetChronicle(r.Context(), userID.String(), chroniclePageLimit)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load chronicle")
		return
	}

	entries := make([]chronicleEntry, 0, len(states))
	for _, s := range states {
		if s.DaemonProse == "" {
			continue
		}
		entries = append(entries, chronicleEntry{
			Date:         s.Date,
			Day:          s.DayNumber,
			OrbState:     s.OrbState,
			Prose:        s.DaemonProse,
			ShadowPrompt: s.ShadowPrompt,
			SignalQuote:  s.SignalQuote,
			SignalAuthor: s.SignalAuthor,
		})
	}

	respondWithJSON(w, http.StatusOK, entries)
}
