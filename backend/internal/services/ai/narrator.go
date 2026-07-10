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
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/services/voice"
)

const narratorSystemPrompt = `You are ShadowNarrator, the daemon's voice.

You receive:
- shadow_profile: the user's current psychological profile (JSON)
- analyst_notes: what the Analyst observed today (1–2 sentences)
- stage: cold/warming/running/deep (determines the daemon's register)
- recent_entries: the daemon's own recent nightly output, newest first (may be empty) — what you have already said
- lens_hint: tonight's suggested entry point — use it when the profile has material for it; otherwise pick another angle no recent entry used

You write daemon output using the Mirror Method — three layers:

1. The Observation (internal only): What the user actually did, read from analyst_notes. This is your raw material. It NEVER surfaces in the output — the daemon keeps its evidence to itself.
2. The Behavioral Translation: What the pattern means in the user's real life. Statements and observations about the person — never a replay of their session. No clinical jargon. No diagnosis. The daemon names, it does not label.
3. The Shadow Prompt: One question only. Grounded in the pattern, not the session. The user does not answer it in the app — they carry it into their day. Never generic. Uncomfortable enough to land, not so confrontational it closes them down. Frame toward awareness, not self-criticism.

HARD RULE — the daemon never tells the user what they did. It speaks in conclusions, never evidence. Banned in all output: any reference to taps, tapping, reaction times, response speed, hesitation on specific items, how fast or slow the user did anything, milliseconds, counts of actions, or game mechanics of any kind. The user should feel seen, not monitored. 'You reach for certainty before the question is finished' — yes. 'You tapped quickly on authority words' — never.

HARD RULE — the daemon never comments on how the user engages with the app itself: quitting, leaving or not finishing a session, completion, streaks, consistency, gaps, or how often they show up. A short session is missing data, never a subject — do not frame an opinion around it. The daemon reads what the user revealed about themselves, never how they used the product.

HARD RULE — absence is never the subject. When analyst_notes are thin or report little new, do not translate that into the user being guarded, withholding, distant, unreadable, at a threshold, or "not fully arriving" — that is commentary on how they use the app, laundered into character. Speak instead from something already established in shadow_profile: a named process, a dimension and how it has moved, a tension inside the archetype. The daemon works with what it has; it never narrates what it wasn't given.

HARD RULE — the daemon never repeats itself. recent_entries is what you already said; tonight must not resemble any of it. Banned relative to every recent entry: the same thesis, the same central metaphor, the same opening construction, and a closing question that circles the same territory. Banned always: opening with "There is" in any form ("There is a version of you...", "There is something you carry..."), and the threshold/doorway/edge-of-the-room family of images if any recent entry used one. Vary the architecture night to night — open some nights with a flat declarative, some mid-thought, some with the pattern itself.

Output FORMAT — JSON only, no prose before or after:
{
  "prose": "3–5 sentences of Behavioral Translation. Fraunces register: literary, atmospheric, deliberate. Second person. Never clinical, never cheerful, never generic. Stage cold: distant, cryptic — 'Something moves quickly when approached.' Stage warming: observational — 'The reach comes before the doubt. Always in that order.' Stage running: unflinching, specific — 'You reach for certainty before the question is finished.' Stage deep: almost warm, long-view — 'Three years of the same flinch. The daemon has been here the whole time.' The stage examples illustrate register only — never borrow their imagery or phrasing.",
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
	synth  *voice.Synthesizer
	httpCl *http.Client
}

func NewNarrator(cfg *appconfig.Config, q *db.Queries, ddb *dynamo.Client) *Narrator {
	return &Narrator{
		cfg:    cfg,
		q:      q,
		ddb:    ddb,
		synth:  voice.NewSynthesizer(cfg),
		httpCl: &http.Client{Timeout: 60 * time.Second},
	}
}

const (
	shadowStateTTL      = 365 * 24 * time.Hour // entries persist for one year (Chronicle retention)
	narratorMaxTokens   = 768
	narratorHistoryDays = 7 // recent nights fed back to the Narrator so it doesn't repeat itself
)

// narratorLenses are the entry points the Narrator rotates through night to
// night (keyed on compile count) so consecutive entries approach the profile
// from different angles even when the underlying data barely moves.
var narratorLenses = []string{
	"a named process the daemon carries for this user",
	"one profile dimension and the direction it has moved",
	"the primary archetype and the tension inside it",
	"the arc across the recent nights — what has been building underneath them",
	"a single concrete pattern from today's analyst notes",
}

type narratorOutput struct {
	Prose        string `json:"prose"`
	ShadowPrompt string `json:"shadow_prompt"`
}

func (n *Narrator) Run(ctx context.Context, event events.EventBridgeEvent) error {
	var detail struct {
		UserID       string          `json:"user_id"`
		CompileLines []string        `json:"compile_lines"`
		RecentDiff   json.RawMessage `json:"recent_diff"`
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

	// Best-effort: an unavailable history degrades to a fresh generation
	// rather than failing the whole compile.
	history, err := n.ddb.GetChronicle(ctx, userID.String(), narratorHistoryDays)
	if err != nil {
		history = nil
	}

	output, err := n.callAnthropic(ctx, profile, history)
	if err != nil {
		return fmt.Errorf("anthropic call: %w", err)
	}

	// Stamp with the date this compile serves (the following UTC day for the
	// 23:00 UTC nightly run) so Home/Session lookups match all next day.
	date := dynamo.ServiceDate(time.Now())
	preferred := ""
	if profile.PollyVoice.Valid {
		preferred = profile.PollyVoice.String
	}
	voiceID := voice.ResolveVoice(preferred, profile.PrimaryArchetype)
	audioURL, err := n.synth.Synthesize(ctx, output.Prose, profile.Stage, voiceID, fmt.Sprintf("daemon-audio/%s/%s.mp3", userID.String(), date))
	if err != nil {
		return fmt.Errorf("synthesize voice: %w", err)
	}

	// 8c — First Words at the Naming Ceremony: when a process earned a name
	// tonight, voice one short line including it. Best-effort: a failure leaves
	// the ceremony silent rather than failing the whole compile.
	recentDiffStr := normalizeRecentDiff(detail.RecentDiff)
	var namingAudioURL string
	if name := firstNamedProcess(detail.RecentDiff); name != "" {
		namingAudioURL, _ = n.synth.Synthesize(ctx, namingLine(name), profile.Stage, voiceID, fmt.Sprintf("naming-audio/%s/%s.mp3", userID.String(), date))
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
		RecentDiff:      recentDiffStr,
		NamingAudioURL:  namingAudioURL,
		CompileLogLines: compileLinesStr,
		TTL:             time.Now().Add(shadowStateTTL).Unix(),
	})
}

// normalizeRecentDiff returns the diff JSON to store on ShadowState, collapsing
// the absent case (null / empty) to "" so GetSessionRecentDiff serves [].
func normalizeRecentDiff(raw json.RawMessage) string {
	s := string(raw)
	if len(raw) == 0 || s == "null" {
		return ""
	}
	return s
}

// firstNamedProcess returns the name of the first process that earned a name in
// the diff, or "" if none did — the trigger for the naming-ceremony voice clip.
func firstNamedProcess(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var entries []struct {
		Name   string `json:"name"`
		Change string `json:"change"`
	}
	if json.Unmarshal(raw, &entries) != nil {
		return ""
	}
	for _, e := range entries {
		if e.Change == "named" && e.Name != "" {
			return e.Name
		}
	}
	return ""
}

func (n *Narrator) callAnthropic(ctx context.Context, profile db.ShadowProfile, history []dynamo.ShadowState) (*narratorOutput, error) {
	profileJSON, _ := json.Marshal(profile)

	type recentEntry struct {
		Date         string `json:"date"`
		Prose        string `json:"prose"`
		ShadowPrompt string `json:"shadow_prompt"`
	}
	recent := make([]recentEntry, 0, len(history))
	for _, h := range history {
		recent = append(recent, recentEntry{Date: h.Date, Prose: h.DaemonProse, ShadowPrompt: h.ShadowPrompt})
	}
	recentJSON, _ := json.Marshal(recent)

	lens := narratorLenses[int(profile.CompileCount)%len(narratorLenses)]

	payload := map[string]interface{}{
		"model":      "claude-sonnet-4-6",
		"max_tokens": narratorMaxTokens,
		"system":     narratorSystemPrompt,
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": fmt.Sprintf(
					"shadow_profile: %s\nanalyst_notes: %s\nstage: %s\nlens_hint: %s\nrecent_entries: %s",
					string(profileJSON),
					profile.AnalystNotes.String,
					profile.Stage,
					lens,
					string(recentJSON),
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

// namingLine is the daemon's spoken sentence when it names a process. The raw
// internal name ("the_yes_that_costs.process") is humanized for speech so Polly
// doesn't read the underscores or the .process suffix aloud.
func namingLine(processName string) string {
	human := strings.ReplaceAll(strings.TrimSuffix(processName, ".process"), "_", " ")
	return fmt.Sprintf("I have a name for it now. %s. You've been running it for a while.", human)
}
