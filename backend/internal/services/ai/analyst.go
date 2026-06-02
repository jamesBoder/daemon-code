package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge"
	ebtypes "github.com/aws/aws-sdk-go-v2/service/eventbridge/types"
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
)

// analystSystemPrompt is the core of the product. Iterate here during Phase 2.
//
// NOTE: Anthropic prompt caching requires a minimum of 1024 tokens in the cached block.
// The current prompt is ~200 tokens — expand it with archetype definitions, example
// inputs/outputs, and edge case guidance before relying on caching. Target 1200–1500 tokens.
const analystSystemPrompt = `You are ShadowAnalyst, an AI that builds psychological profiles from behavioral patterns.

You receive:
- card_responses: today's reaction test taps, weighted scale choices, prediction duel answers
- mood_log: today's mood score (1–5) and optional note
- current_profile: the existing shadow profile (JSON)

You output a structured JSON update to the shadow profile. Never produce prose — only structured data.

Output format:
{
  "primary_archetype": "abandoned_child|unworthy_self|caged_rage|grief_carrier|default",
  "signal_confidence": 0.0-1.0,
  "kernel_access": 0-100,
  "stage": "cold|warming|running|deep",
  "posture": 0.0-1.0,
  "environment": "neutral|water|fire",
  "texture": "smooth|fractured",
  "fragments_decoded_delta": integer,
  "analyst_notes": "1-2 sentences on what you observed today — used by Narrator",
  "pattern_updates": [
    {
      "pattern_id": "uuid or null for new",
      "name": "the_approval_loop.process or null if unnamed",
      "state": "running|sleeping|weakening|new",
      "strength_delta": integer,
      "daemon_note": "one line, what the daemon observes about this pattern"
    }
  ]
}

Be specific. "The user tapped quickly on authority words and slowly on vulnerability words" is better than "the user responded to stimuli."
Patterns should earn names only when the data is clear. Unnamed patterns remain unnamed.
The daemon does not speculate — it observes.`

type Analyst struct {
	cfg    *appconfig.Config
	q      *db.Queries
	eb     *eventbridge.Client
	httpCl *http.Client
}

func NewAnalyst(cfg *appconfig.Config, q *db.Queries) *Analyst {
	awsCfg, _ := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(cfg.AWSRegion))
	return &Analyst{
		cfg:    cfg,
		q:      q,
		eb:     eventbridge.NewFromConfig(awsCfg),
		httpCl: &http.Client{Timeout: 60 * time.Second},
	}
}

type analystOutput struct {
	PrimaryArchetype      string          `json:"primary_archetype"`
	SignalConfidence      float64         `json:"signal_confidence"`
	KernelAccess          int32           `json:"kernel_access"`
	Stage                 string          `json:"stage"`
	Posture               float64         `json:"posture"`
	Environment           string          `json:"environment"`
	Texture               string          `json:"texture"`
	FragmentsDecodedDelta int             `json:"fragments_decoded_delta"`
	AnalystNotes          string          `json:"analyst_notes"`
	PatternUpdates        []patternUpdate `json:"pattern_updates"`
}

type patternUpdate struct {
	PatternID     *string `json:"pattern_id"`
	Name          *string `json:"name"`
	State         string  `json:"state"`
	StrengthDelta int     `json:"strength_delta"`
	DaemonNote    string  `json:"daemon_note"`
}

// RunForUser is called with the raw SQS message body (JSON: {"user_id": "<uuid>"}).
func (a *Analyst) RunForUser(ctx context.Context, sqsBody string) error {
	var msg struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(sqsBody), &msg); err != nil {
		return fmt.Errorf("parse sqs body: %w", err)
	}

	userID, err := uuid.Parse(msg.UserID)
	if err != nil {
		return fmt.Errorf("parse user_id: %w", err)
	}

	today := time.Now().UTC().Format("2006-01-02")

	// 1. Load today's card responses
	responses, err := a.q.GetResponsesForDate(ctx, db.GetResponsesForDateParams{
		UserID:      userID,
		SessionDate: pgDate(today),
	})
	if err != nil {
		return fmt.Errorf("get responses: %w", err)
	}

	// 2. Load today's mood logs
	moods, err := a.q.GetMoodLogsForDate(ctx, db.GetMoodLogsForDateParams{
		UserID:  userID,
		LogDate: pgDate(today),
	})
	if err != nil {
		return fmt.Errorf("get mood logs: %w", err)
	}

	// 3. Load current shadow profile
	profile, err := a.q.GetShadowProfile(ctx, userID)
	if err != nil {
		return fmt.Errorf("get shadow profile: %w", err)
	}

	// 4. Call Anthropic API
	output, err := a.callAnthropic(ctx, responses, moods, profile)
	if err != nil {
		return fmt.Errorf("anthropic call: %w", err)
	}

	// 5. Write updated profile to RDS
	_, err = a.q.UpdateShadowProfile(ctx, db.UpdateShadowProfileParams{
		UserID:           userID,
		PrimaryArchetype: output.PrimaryArchetype,
		SignalConfidence: pgNumeric(output.SignalConfidence),
		KernelAccess:     output.KernelAccess,
		Stage:            output.Stage,
		Posture:          pgNumeric(output.Posture),
		Environment:      output.Environment,
		Texture:          output.Texture,
		FragmentsDecoded: profile.FragmentsDecoded + int32(output.FragmentsDecodedDelta), // #nosec G115 — delta bounded [-100,100] by Analyst prompt
		CompileCount:     profile.CompileCount + 1,
		AnalystNotes:     pgTextPtr(&output.AnalystNotes),
	})
	if err != nil {
		return fmt.Errorf("update shadow profile: %w", err)
	}

	// 6. Apply pattern updates
	if err := a.applyPatternUpdates(ctx, userID, output.PatternUpdates); err != nil {
		return fmt.Errorf("pattern updates: %w", err)
	}

	// 7. Emit ShadowAnalystComplete to custom EventBridge bus
	detail, _ := json.Marshal(map[string]string{"user_id": userID.String()})
	_, err = a.eb.PutEvents(ctx, &eventbridge.PutEventsInput{
		Entries: []ebtypes.PutEventsRequestEntry{
			{
				Source:       aws.String("daemon-code.analyst"),
				DetailType:   aws.String("ShadowAnalystComplete"),
				Detail:       aws.String(string(detail)),
				EventBusName: aws.String(a.cfg.EventBusName),
			},
		},
	})
	return err
}

func (a *Analyst) applyPatternUpdates(ctx context.Context, userID uuid.UUID, updates []patternUpdate) error {
	existing, err := a.q.GetPatternLibrary(ctx, userID)
	if err != nil {
		return err
	}
	strengthMap := make(map[uuid.UUID]int32)
	for _, p := range existing {
		strengthMap[p.ID] = p.Strength
	}

	for _, u := range updates {
		if u.PatternID == nil || *u.PatternID == "" {
			// New pattern
			unnamed := u.Name == nil
			var name *string
			if !unnamed {
				name = u.Name
			}
			_, err := a.q.InsertPattern(ctx, db.InsertPatternParams{
				UserID:        userID,
				Name:          pgTextPtr(name),
				State:         u.State,
				Strength:      10,
				Unnamed:       unnamed,
				FirstDetected: pgDateToday(),
				DaemonNote:    pgTextPtr(&u.DaemonNote),
			})
			if err != nil {
				return err
			}
		} else {
			patternID, err := uuid.Parse(*u.PatternID)
			if err != nil {
				continue
			}
			newStrength := strengthMap[patternID] + int32(u.StrengthDelta) // #nosec G115 — delta is bounded [-100,100] by Analyst prompt
			if newStrength < 0 {
				newStrength = 0
			}
			if newStrength > 100 {
				newStrength = 100
			}
			unnamed := u.Name == nil
			today := pgDateToday()
			_, err = a.q.UpdatePattern(ctx, db.UpdatePatternParams{
				ID:         patternID,
				Name:       pgTextPtr(u.Name),
				State:      u.State,
				Strength:   newStrength,
				Unnamed:    unnamed,
				LastSeen:   today,
				DaemonNote: pgTextPtr(&u.DaemonNote),
			})
			if err != nil {
				return err
			}
		}
	}
	return nil
}

// callAnthropic calls the Anthropic messages API with prompt caching on the system prompt.
func (a *Analyst) callAnthropic(ctx context.Context, responses []db.CardResponse, moods []db.MoodLog, profile db.ShadowProfile) (*analystOutput, error) {
	profileJSON, _ := json.Marshal(profile)
	responsesJSON, _ := json.Marshal(responses)
	moodsJSON, _ := json.Marshal(moods)

	payload := map[string]interface{}{
		"model":      "claude-sonnet-4-6",
		"max_tokens": 1024,
		"system": []map[string]interface{}{
			{
				"type":          "text",
				"text":          analystSystemPrompt,
				"cache_control": map[string]string{"type": "ephemeral"},
			},
		},
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": fmt.Sprintf(
					"card_responses: %s\nmood_log: %s\ncurrent_profile: %s",
					string(responsesJSON), string(moodsJSON), string(profileJSON),
				),
			},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", a.cfg.AnthropicAPIKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("anthropic-beta", "prompt-caching-2024-07-31")

	resp, err := a.httpCl.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anthropic API error %d: %s", resp.StatusCode, respBody)
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &apiResp); err != nil || len(apiResp.Content) == 0 {
		return nil, fmt.Errorf("parse anthropic response: %w", err)
	}

	text := stripMarkdownFence(apiResp.Content[0].Text)
	var output analystOutput
	if err := json.Unmarshal([]byte(text), &output); err != nil {
		return nil, fmt.Errorf("parse analyst output JSON: %w", err)
	}
	return &output, nil
}
