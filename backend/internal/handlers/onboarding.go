package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

type onboardingRequest struct {
	Responses struct {
		ReactionTest  json.RawMessage `json:"reaction_test"`
		WeightedScale json.RawMessage `json:"weighted_scale"`
		SpeedRound    json.RawMessage `json:"speed_round"`
	} `json:"responses"`
}

func (h *handler) OnboardingComplete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req onboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	today := pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}

	// Store each response type as a card_response so the Analyst has data to work with.
	// Using the existing card_responses table avoids a new schema; the Analyst already reads it.
	type responseEntry struct {
		fragmentID   string
		fragmentType string
		data         json.RawMessage
	}
	for _, e := range []responseEntry{
		{"onboarding_reaction_test", "reaction_test", req.Responses.ReactionTest},
		{"onboarding_weighted_scale", "weighted_scale", req.Responses.WeightedScale},
		{"onboarding_speed_round", "speed_round", req.Responses.SpeedRound},
	} {
		if len(e.data) == 0 {
			continue
		}
		if err := h.q.InsertCardResponse(r.Context(), db.InsertCardResponseParams{
			UserID:       userID,
			FragmentID:   e.fragmentID,
			FragmentType: e.fragmentType,
			ResponseData: []byte(e.data),
			SessionDate:  today,
		}); err != nil {
			log.Printf("onboarding: store %s for user %s: %v", e.fragmentType, userID, err)
		}
	}

	if err := h.q.UpdateOnboardingComplete(r.Context(), userID); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not complete onboarding")
		return
	}

	// Trigger Analyst immediately — fire-and-forget, do not block the response
	if h.sqsClient != nil && h.cfg.SQSQueueURL != "" {
		body, _ := json.Marshal(map[string]string{"user_id": userID.String()})
		if _, err := h.sqsClient.SendMessage(r.Context(), &sqs.SendMessageInput{
			QueueUrl:    aws.String(h.cfg.SQSQueueURL),
			MessageBody: aws.String(string(body)),
		}); err != nil {
			log.Printf("onboarding: trigger analyst for user %s: %v", userID, err)
			// Non-fatal — nightly cron will catch them
		}
	}

	respondWithJSON(w, http.StatusOK, map[string]bool{"onboarding_complete": true})
}
