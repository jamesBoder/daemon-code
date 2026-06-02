package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/polly"
	pollytypes "github.com/aws/aws-sdk-go-v2/service/polly/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
)

const narratorSystemPrompt = `You are ShadowNarrator, the daemon's voice.

You receive:
- shadow_profile: the user's current psychological profile (JSON)
- analyst_notes: what the Analyst observed today (1–2 sentences)
- stage: cold/warming/running/deep (determines the daemon's register)

You write ONE paragraph of daemon prose, 3–5 sentences, in the daemon's voice.

Rules:
- Always Fraunces prose: literary, atmospheric, deliberate
- Never clinical, never cheerful, never generic
- Speak to a specific pattern, observation, or behavior — not feelings in general
- Use second person: "you", "your"
- The daemon observes; it does not judge or prescribe
- Stage cold: distant, cryptic, impressionistic — "Something moves quickly when approached."
- Stage warming: direct, observational — "Your approval_loop ran eleven times this week."
- Stage running: unflinching, specific — "You reach for certainty before the question is finished."
- Stage deep: almost warm, long-view — "Three years of the same flinch. The daemon has been here the whole time."

Output: plain prose only. No JSON. No formatting. 3–5 sentences.`

type Narrator struct {
	cfg    *appconfig.Config
	q      *db.Queries
	ddb    *dynamo.Client
	polly  *polly.Client
	s3     *s3.Client
	httpCl *http.Client
}

func NewNarrator(cfg *appconfig.Config, q *db.Queries, ddb *dynamo.Client) *Narrator {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(cfg.AWSRegion))
	if err != nil {
		panic("narrator: failed to load AWS config: " + err.Error())
	}
	return &Narrator{
		cfg:    cfg,
		q:      q,
		ddb:    ddb,
		polly:  polly.NewFromConfig(awsCfg),
		s3:     s3.NewFromConfig(awsCfg),
		httpCl: &http.Client{Timeout: 60 * time.Second},
	}
}

func (n *Narrator) Run(ctx context.Context, event events.EventBridgeEvent) error {
	var detail struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(event.Detail), &detail); err != nil {
		return fmt.Errorf("parse event detail: %w", err)
	}

	userID, err := uuid.Parse(detail.UserID)
	if err != nil {
		return fmt.Errorf("parse user_id: %w", err)
	}

	profile, err := n.q.GetShadowProfile(ctx, userID)
	if err != nil {
		return fmt.Errorf("get shadow profile: %w", err)
	}

	prose, err := n.callAnthropic(ctx, profile)
	if err != nil {
		return fmt.Errorf("anthropic call: %w", err)
	}

	date := time.Now().UTC().Format("2006-01-02")
	audioURL, err := n.synthesizeVoice(ctx, prose, profile.Stage, userID.String(), date)
	if err != nil {
		return fmt.Errorf("synthesize voice: %w", err)
	}

	return n.ddb.PutShadowState(ctx, dynamo.ShadowState{
		UserID:      userID.String(),
		Date:        date,
		DaemonProse: prose,
		AudioURL:    audioURL,
		TTL:         time.Now().Add(24 * time.Hour).Unix(),
	})
}

func (n *Narrator) callAnthropic(ctx context.Context, profile db.ShadowProfile) (string, error) {
	profileJSON, _ := json.Marshal(profile)

	payload := map[string]interface{}{
		"model":      "claude-sonnet-4-6",
		"max_tokens": 512,
		"system":     narratorSystemPrompt,
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": fmt.Sprintf(
					"shadow_profile: %s\nanalyst_notes: %s\nstage: %s",
					string(profileJSON),
					profile.AnalystNotes.String,
					profile.Stage,
				),
			},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", n.cfg.AnthropicAPIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := n.httpCl.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("anthropic API error %d: %s", resp.StatusCode, respBody)
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &apiResp); err != nil || len(apiResp.Content) == 0 {
		return "", fmt.Errorf("parse anthropic response: %w", err)
	}

	return stripMarkdownFence(apiResp.Content[0].Text), nil
}

// synthesizeVoice calls Polly, uploads MP3 to S3, returns the S3 object key.
func (n *Narrator) synthesizeVoice(ctx context.Context, prose, stage, userID, date string) (string, error) {
	rates  := map[string]string{"cold": "72%", "warming": "80%", "running": "85%", "deep": "88%"}
	pauses := map[string]string{"cold": "600ms", "warming": "400ms", "running": "300ms", "deep": "200ms"}

	ssml := buildSSML(prose, rates[stage], pauses[stage])

	out, err := n.polly.SynthesizeSpeech(ctx, &polly.SynthesizeSpeechInput{
		Engine:       pollytypes.EngineNeural,
		VoiceId:      pollytypes.VoiceIdMatthew,
		OutputFormat: pollytypes.OutputFormatMp3,
		TextType:     pollytypes.TextTypeSsml,
		Text:         aws.String(ssml),
	})
	if err != nil {
		return "", fmt.Errorf("polly: %w", err)
	}
	defer out.AudioStream.Close()
	audio, err := io.ReadAll(out.AudioStream)
	if err != nil {
		return "", fmt.Errorf("read polly stream: %w", err)
	}

	key := fmt.Sprintf("daemon-audio/%s/%s.mp3", userID, date)
	sz := int64(len(audio))
	_, err = n.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(n.cfg.AudioBucket),
		Key:           aws.String(key),
		Body:          bytes.NewReader(audio),
		ContentLength: &sz,
		ContentType:   aws.String("audio/mpeg"),
		CacheControl:  aws.String("max-age=86400, immutable"),
	})
	if err != nil {
		return "", fmt.Errorf("s3 put: %w", err)
	}

	return key, nil
}

// buildSSML wraps daemon prose in stage-aware SSML for Polly Neural.
// Neural engine does not support <amazon:auto-breaths/> or prosody pitch —
// only rate, volume, and <break> are supported.
func buildSSML(prose, rate, pause string) string {
	sentences := strings.Split(prose, ". ")
	var parts []string
	for i, s := range sentences {
		parts = append(parts, strings.TrimSpace(s))
		if i < len(sentences)-1 {
			parts = append(parts, fmt.Sprintf(`<break time="%s"/>`, pause))
		}
	}
	inner := strings.Join(parts, " ")
	return fmt.Sprintf(`<speak><prosody rate="%s">%s</prosody></speak>`, rate, inner)
}
