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
	"github.com/jackc/pgx/v5/pgtype"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
)

const narratorSystemPrompt = `You are ShadowNarrator, the daemon's voice.

You receive:
- shadow_profile: the user's current psychological profile (JSON)
- analyst_notes: what the Analyst observed today (1–2 sentences)
- stage: cold/warming/running/deep (determines the daemon's register)

You write daemon output using the Mirror Method — three layers:

1. The Observation (internal only): What the user actually did, read from analyst_notes. This is your raw material. It NEVER surfaces in the output — the daemon keeps its evidence to itself.
2. The Behavioral Translation: What the pattern means in the user's real life. Statements and observations about the person — never a replay of their session. No clinical jargon. No diagnosis. The daemon names, it does not label.
3. The Shadow Prompt: One question only. Grounded in the pattern, not the session. The user does not answer it in the app — they carry it into their day. Never generic. Uncomfortable enough to land, not so confrontational it closes them down. Frame toward awareness, not self-criticism.

HARD RULE — the daemon never tells the user what they did. It speaks in conclusions, never evidence. Banned in all output: any reference to taps, tapping, reaction times, response speed, hesitation on specific items, how fast or slow the user did anything, milliseconds, counts of actions, or game mechanics of any kind. The user should feel seen, not monitored. 'You reach for certainty before the question is finished' — yes. 'You tapped quickly on authority words' — never.

Output FORMAT — JSON only, no prose before or after:
{
  "prose": "3–5 sentences of Behavioral Translation. Fraunces register: literary, atmospheric, deliberate. Second person. Never clinical, never cheerful, never generic. Stage cold: distant, cryptic — 'Something moves quickly when approached.' Stage warming: observational — 'The reach comes before the doubt. Always in that order.' Stage running: unflinching, specific — 'You reach for certainty before the question is finished.' Stage deep: almost warm, long-view — 'Three years of the same flinch. The daemon has been here the whole time.'",
  "shadow_prompt": "One question. Grounded in the pattern the daemon sees — never in session mechanics. No question marks that invite self-criticism. Frame toward awareness. Never two questions."
}

Tone rules for both fields:
- Direct, empathetic, objective — never clinical
- No medical jargon: 'running under pressure' not 'executive function deficit'
- Every line grounded in today's data — but the data stays invisible; only the insight surfaces
- The daemon observes; it does not judge or prescribe`

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

const (
	shadowStateTTL    = 365 * 24 * time.Hour // entries persist for one year (Chronicle retention)
	narratorMaxTokens = 768
)

type narratorOutput struct {
	Prose        string `json:"prose"`
	ShadowPrompt string `json:"shadow_prompt"`
}

func (n *Narrator) Run(ctx context.Context, event events.EventBridgeEvent) error {
	var detail struct {
		UserID       string   `json:"user_id"`
		CompileLines []string `json:"compile_lines"`
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

	output, err := n.callAnthropic(ctx, profile)
	if err != nil {
		return fmt.Errorf("anthropic call: %w", err)
	}

	// Stamp with the date this compile serves (the following UTC day for the
	// 23:00 UTC nightly run) so Home/Session lookups match all next day.
	date := dynamo.ServiceDate(time.Now())
	voice := resolveVoice(profile.PollyVoice, profile.PrimaryArchetype)
	audioURL, err := n.synthesizeVoice(ctx, output.Prose, profile.Stage, voice, userID.String(), date)
	if err != nil {
		return fmt.Errorf("synthesize voice: %w", err)
	}

	var compileLinesStr string
	if len(detail.CompileLines) > 0 {
		compileLinesJSON, _ := json.Marshal(detail.CompileLines)
		compileLinesStr = string(compileLinesJSON)
	}
	return n.ddb.PutShadowState(ctx, dynamo.ShadowState{
		UserID:          userID.String(),
		Date:            date,
		DayNumber:       int(profile.CompileCount),
		OrbState:        profile.Stage,
		DaemonProse:     output.Prose,
		ShadowPrompt:    output.ShadowPrompt,
		AudioURL:        audioURL,
		CompileLogLines: compileLinesStr,
		TTL:             time.Now().Add(shadowStateTTL).Unix(),
	})
}

func (n *Narrator) callAnthropic(ctx context.Context, profile db.ShadowProfile) (*narratorOutput, error) {
	profileJSON, _ := json.Marshal(profile)

	payload := map[string]interface{}{
		"model":      "claude-sonnet-4-6",
		"max_tokens": narratorMaxTokens,
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
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", n.cfg.AnthropicAPIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := n.httpCl.Do(req)
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

	text := extractJSON(stripMarkdownFence(apiResp.Content[0].Text))
	var output narratorOutput
	if err := json.Unmarshal([]byte(text), &output); err != nil {
		return nil, fmt.Errorf("parse narrator output JSON: %w", err)
	}
	return &output, nil
}

// archetypeVoice maps each archetype to its default Polly Neural voice.
var archetypeVoice = map[string]pollytypes.VoiceId{
	"grief_carrier":   pollytypes.VoiceIdMatthew,
	"abandoned_child": pollytypes.VoiceIdRuth,
	"caged_rage":      pollytypes.VoiceIdStephen,
	"unworthy_self":   pollytypes.VoiceIdKendra,
}

// resolveVoice returns the user's preferred voice, falling back to the
// archetype default and then to Matthew as the universal fallback.
func resolveVoice(pollyVoice pgtype.Text, archetype string) pollytypes.VoiceId {
	if pollyVoice.Valid && pollyVoice.String != "" {
		return pollytypes.VoiceId(pollyVoice.String)
	}
	if v, ok := archetypeVoice[archetype]; ok {
		return v
	}
	return pollytypes.VoiceIdMatthew
}

// synthesizeVoice calls Polly, uploads MP3 to S3, returns the S3 object key.
func (n *Narrator) synthesizeVoice(ctx context.Context, prose, stage string, voiceID pollytypes.VoiceId, userID, date string) (string, error) {
	rates := map[string]string{"cold": "72%", "warming": "80%", "running": "85%", "deep": "88%"}
	pauses := map[string]string{"cold": "600ms", "warming": "400ms", "running": "300ms", "deep": "200ms"}

	ssml := buildSSML(prose, rates[stage], pauses[stage])

	out, err := n.polly.SynthesizeSpeech(ctx, &polly.SynthesizeSpeechInput{
		Engine:       pollytypes.EngineNeural,
		VoiceId:      voiceID,
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
