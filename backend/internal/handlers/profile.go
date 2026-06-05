package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

var allowedVoices = map[string]bool{
	"Matthew": true,
	"Ruth":    true,
	"Stephen": true,
	"Kendra":  true,
	"Amy":     true,
	"Brian":   true,
}

var samplePresignExpiry = 1 * time.Hour

func (h *handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	profile, err := h.q.GetShadowProfile(r.Context(), userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load profile")
		return
	}

	respondWithJSON(w, http.StatusOK, profile)
}

func (h *handler) PatchProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		PollyVoice *string `json:"polly_voice"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var voice pgtype.Text
	if body.PollyVoice != nil {
		v := strings.TrimSpace(*body.PollyVoice)
		if v != "" && !allowedVoices[v] {
			respondWithError(w, http.StatusBadRequest, "invalid voice")
			return
		}
		voice = pgtype.Text{String: v, Valid: v != ""}
	}

	if err := h.q.UpdatePollyVoice(r.Context(), userID, voice); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not update voice")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetAudioSample presigns a voice preview clip stored at voice-samples/{voice}.mp3.
// The clips are static S3 assets — same content for all users, no personalization.
func (h *handler) GetAudioSample(w http.ResponseWriter, r *http.Request) {
	voice := strings.TrimSpace(r.URL.Query().Get("voice"))
	if !allowedVoices[voice] {
		respondWithError(w, http.StatusBadRequest, "invalid voice")
		return
	}

	key := "voice-samples/" + voice + ".mp3"
	req, err := h.s3presign.PresignGetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(h.cfg.AudioBucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(samplePresignExpiry))
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not generate sample URL")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"url": req.URL})
}

// GetOnboardingAudioSample presigns one of the three onboarding voice clips.
// Keys: voice-samples/onboarding/{voice}.mp3 (lowercase).
func (h *handler) GetOnboardingAudioSample(w http.ResponseWriter, r *http.Request) {
	voice := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("voice")))
	onboardingVoices := map[string]bool{"matthew": true, "ruth": true, "stephen": true}
	if !onboardingVoices[voice] {
		respondWithError(w, http.StatusBadRequest, "invalid voice")
		return
	}

	key := "voice-samples/onboarding/" + voice + ".mp3"
	req, err := h.s3presign.PresignGetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(h.cfg.AudioBucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(samplePresignExpiry))
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not generate sample URL")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"url": req.URL})
}
