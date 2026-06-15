package handlers

import (
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

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
	AudioURL     string `json:"audioUrl,omitempty"`
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
		// Legacy records stored a full presigned URL (now expired) instead of
		// an S3 key — skip those; entries without audio just omit the field.
		var audioURL string
		if s.AudioURL != "" && !strings.HasPrefix(s.AudioURL, "https://") {
			req, err := h.s3presign.PresignGetObject(r.Context(), &s3.GetObjectInput{
				Bucket: aws.String(h.cfg.AudioBucket),
				Key:    aws.String(s.AudioURL),
			}, s3.WithPresignExpires(audioPresignExpiry))
			if err == nil {
				audioURL = req.URL
			}
		}
		entries = append(entries, chronicleEntry{
			Date:         s.Date,
			Day:          s.DayNumber,
			OrbState:     s.OrbState,
			Prose:        s.DaemonProse,
			ShadowPrompt: s.ShadowPrompt,
			SignalQuote:  s.SignalQuote,
			SignalAuthor: s.SignalAuthor,
			AudioURL:     audioURL,
		})
	}

	respondWithJSON(w, http.StatusOK, entries)
}
