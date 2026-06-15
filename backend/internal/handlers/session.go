package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

type processDiff struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Change   string  `json:"change"`              // "named" | "strength_up" | "strength_down" | "new"
	FromName *string `json:"from_name,omitempty"` // previous name for "named" changes
	Delta    *int    `json:"delta,omitempty"`     // strength delta for strength changes
}

// recentDiffResponse carries the per-pattern diff plus the presigned naming
// ceremony voice clip (8c), served only on nights a process earned a name.
type recentDiffResponse struct {
	Diff           []processDiff `json:"diff"`
	NamingAudioURL string        `json:"namingAudioUrl,omitempty"`
}

func (h *handler) GetSessionRecentDiff(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	state, err := h.ddb.GetLatestShadowState(r.Context(), userID.String())
	if err != nil || state == nil || state.RecentDiff == "" {
		respondWithJSON(w, http.StatusOK, recentDiffResponse{Diff: []processDiff{}})
		return
	}

	var diff []processDiff
	if err := json.Unmarshal([]byte(state.RecentDiff), &diff); err != nil {
		respondWithJSON(w, http.StatusOK, recentDiffResponse{Diff: []processDiff{}})
		return
	}

	resp := recentDiffResponse{Diff: diff}
	// Presign the naming-ceremony clip when one was synthesized tonight. Skip
	// legacy full-URL values (pre-key storage), mirroring chronicle.go.
	if state.NamingAudioURL != "" && !strings.HasPrefix(state.NamingAudioURL, "https://") {
		req, err := h.s3presign.PresignGetObject(r.Context(), &s3.GetObjectInput{
			Bucket: aws.String(h.cfg.AudioBucket),
			Key:    aws.String(state.NamingAudioURL),
		}, s3.WithPresignExpires(audioPresignExpiry))
		if err == nil {
			resp.NamingAudioURL = req.URL
		}
	}

	respondWithJSON(w, http.StatusOK, resp)
}

func (h *handler) GetSessionToday(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	deck, err := h.ddb.GetDailyDeck(r.Context(), userID.String())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load session")
		return
	}

	if deck == nil {
		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"fragments": []interface{}{},
			"ready":     false,
		})
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"fragments": deck.Fragments,
		"ready":     true,
	})
}

type cardResponseRequest struct {
	FragmentID   string          `json:"fragment_id"`
	FragmentType string          `json:"fragment_type"`
	ResponseData json.RawMessage `json:"response_data"`
}

func (h *handler) PostSessionResponse(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req cardResponseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FragmentID == "" || req.FragmentType == "" {
		respondWithError(w, http.StatusBadRequest, "fragment_id and fragment_type required")
		return
	}

	today := pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}
	if err := h.q.InsertCardResponse(r.Context(), db.InsertCardResponseParams{
		UserID:       userID,
		FragmentID:   req.FragmentID,
		FragmentType: req.FragmentType,
		ResponseData: req.ResponseData,
		SessionDate:  today,
	}); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not save response")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type moodRequest struct {
	Score int    `json:"score"`
	Note  string `json:"note"`
}

func (h *handler) PostMood(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req moodRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Score < 1 || req.Score > 5 {
		respondWithError(w, http.StatusBadRequest, "score must be between 1 and 5")
		return
	}

	today := pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}
	note := pgtype.Text{Valid: req.Note != ""}
	if req.Note != "" {
		note.String = req.Note
	}
	if err := h.q.InsertMoodLog(r.Context(), db.InsertMoodLogParams{
		UserID:    userID,
		MoodScore: int32(req.Score),
		Note:      note,
		LogDate:   today,
	}); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not save mood")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
