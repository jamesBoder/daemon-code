package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/jamesboder/daemon-code/internal/middleware"
)

// selfDimension is one behavioral dimension as the client needs it to render the
// Portrait: only the score and its confidence. The stored JSONB also carries n /
// last_delta (Analyst bookkeeping) — deliberately not exposed; the surface shows
// the shape, never the raw model internals (features-horizon P1).
type selfDimension struct {
	Score      float64 `json:"score"`
	Confidence float64 `json:"confidence"`
}

// selfResponse is the read the Self screen renders the Portrait from. No raw
// numbers are ever shown to the user — they drive the generative form.
type selfResponse struct {
	Dimensions       map[string]selfDimension `json:"dimensions"`
	SignalConfidence float64                  `json:"signalConfidence"`
	Archetype        string                   `json:"archetype"`
	Stage            string                   `json:"stage"`
	CompileCount     int32                    `json:"compileCount"`
}

// GetSelf returns the daemon's current read of the user — the dimension vector,
// per-dimension confidence, archetype, and stage — for the Portrait render.
// Read-only against shadow_profiles.profile_dimensions (no AI, no new infra).
func (h *handler) GetSelf(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	profile, err := h.q.GetShadowProfile(r.Context(), userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load profile")
		return
	}

	// Dimensions must always be a JSON object, never null — the client does
	// Object.keys(dimensions) on it.
	dims := parseDimensions(profile.ProfileDimensions)
	if dims == nil {
		dims = map[string]selfDimension{}
	}

	resp := selfResponse{
		Dimensions:       dims,
		SignalConfidence: numericToFloat(profile.SignalConfidence),
		Archetype:        profile.PrimaryArchetype,
		Stage:            profile.Stage,
		CompileCount:     profile.CompileCount,
	}

	respondWithJSON(w, http.StatusOK, resp)
}

// parseDimensions decodes the profile_dimensions JSONB into the score/confidence
// pairs the Portrait needs. Empty/null (Day 0, pre-first-compile) yields nil — the
// caller substitutes an empty map and the client renders a low-confidence "still
// forming" portrait. Extra JSONB fields (n, last_delta) are ignored.
func parseDimensions(raw []byte) map[string]selfDimension {
	if len(raw) == 0 {
		return nil
	}
	var stored map[string]selfDimension
	if err := json.Unmarshal(raw, &stored); err != nil {
		return nil
	}
	if len(stored) == 0 {
		return nil
	}
	return stored
}
