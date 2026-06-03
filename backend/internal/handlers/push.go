package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

func (h *handler) PushSubscribe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var sub dynamo.PushSubscription
	if err := json.NewDecoder(r.Body).Decode(&sub); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid subscription")
		return
	}
	if sub.Endpoint == "" {
		respondWithError(w, http.StatusBadRequest, "endpoint required")
		return
	}
	if err := h.ddb.PutPushSubscription(r.Context(), userID.String(), sub); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not save subscription")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
