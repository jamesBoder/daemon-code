package pulse

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"sort"
	"strings"

	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/signal"
)

const (
	pulseModel     = "claude-haiku-4-5-20251001"
	pulseMaxTokens = 512
	repeatGapDays  = 14 // primary repeat gap in days
	relaxedGapDays = 7  // fallback repeat gap when no stimulus passes primary
	nearThreshLo   = 0.40
	nearThreshHi   = 0.49
	challengeConf  = 0.65 // dimensions above this confidence are challenged
)

// dimEntry mirrors the profile_dimensions JSONB entry shape.
type dimEntry struct {
	Score      float64 `json:"score"`
	Confidence float64 `json:"confidence"`
	N          int     `json:"n"`
}

// wordDimensions are the only two axes signal/words.go can probe.
// Pair-level stimuli cover all 10 dimensions via signal/pairs.go.
var wordDimensions = [2]string{"approach_avoidance", "openness"}

// archetypeWordFilter maps archetype names to the word signal direction for the stability check.
// Based on Section 2 spec archetype anchor table.
var archetypeWordFilter = map[string]struct {
	approach    bool
	abstract    bool
	useAbstract bool // when true, filter by Abstract; when false, filter by Approach
}{
	"abandoned_child": {approach: true, useAbstract: false},
	"unworthy_self":   {approach: false, useAbstract: false},
	"caged_rage":      {approach: true, useAbstract: false},
	"grief_carrier":   {approach: false, useAbstract: false},
	"default":         {abstract: true, useAbstract: true},
}

// resultBuckets returns the result bucket names for a given stimulus type.
func resultBuckets(stimType string) []string {
	switch stimType {
	case "weighted_scale":
		return []string{"strong_left", "strong_right", "center"}
	case "prediction_duel":
		return []string{"agree", "disagree"}
	default: // reaction_test
		return []string{"fast", "slow", "skip"}
	}
}

// Generator runs nightly to select one Pulse stimulus per user and generate observation text.
type Generator struct {
	cfg    *appconfig.Config
	q      *db.Queries
	ddb    *dynamo.Client
	httpCl *http.Client
}

func NewGenerator(cfg *appconfig.Config, q *db.Queries, ddb *dynamo.Client) *Generator {
	return &Generator{cfg: cfg, q: q, ddb: ddb, httpCl: &http.Client{}}
}

// RunForUser runs the full PulseGenerator pipeline for one user.
// Silently skips users who don't pass the run gate.
func (g *Generator) RunForUser(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}

	// --- Run gate ---
	profile, err := g.q.GetShadowProfile(ctx, uid)
	if err != nil {
		return fmt.Errorf("load profile: %w", err)
	}
	if profile.CompileCount < 1 {
		return nil
	}
	hasSession, err := g.q.HasRecentSession(ctx, uid)
	if err != nil {
		return fmt.Errorf("check recent session: %w", err)
	}
	if !hasSession {
		return nil
	}

	// --- Load recent pulse responses for repeat gap enforcement ---
	recentPulse, err := g.q.GetRecentPulseResponses(ctx, uid)
	if err != nil {
		return fmt.Errorf("load recent pulse responses: %w", err)
	}
	recentIDs := make(map[string]bool, len(recentPulse))
	for _, r := range recentPulse {
		recentIDs[r.FragmentID] = true
	}

	// --- Parse profile_dimensions ---
	var dims map[string]dimEntry
	if len(profile.ProfileDimensions) > 0 {
		_ = json.Unmarshal(profile.ProfileDimensions, &dims) // tolerate parse failure; nil dims = early-user path
	}

	archetype := profile.PrimaryArchetype
	if archetype == "" {
		archetype = "default"
	}

	// --- Phase A: select one stimulus ---
	stim := g.selectStimulus(dims, recentIDs, profile.CompileCount)
	if stim == nil {
		// Nothing passable found — skip this run rather than emit a bad stimulus.
		return nil
	}

	// --- Phase B: generate observation text ---
	obs, err := g.generateObservations(ctx, stim, archetype)
	if err != nil {
		return fmt.Errorf("generate observations: %w", err)
	}
	stim.DaemonObs = obs

	// --- Word list selection ---
	wordOpts := selectWordOptions(dims, archetype)

	// --- Write to DynamoDB ---
	return g.ddb.PutPulse(ctx, dynamo.PulseItem{
		UserID:      userID,
		Stimulus:    *stim,
		WordOptions: wordOpts,
	})
}

// selectStimulus runs Phase A: choose the single best stimulus from signal/pairs.go or signal/words.go.
// Returns nil only if no valid stimulus can be found after constraint relaxation.
// First pass enforces the 14-day repeat gap; second pass drops the constraint entirely
// (GetRecentPulseResponses only returns 14 days, so 7-day discrimination is not possible).
func (g *Generator) selectStimulus(dims map[string]dimEntry, recentIDs map[string]bool, compileCount int32) *dynamo.PulseStimulus {
	for _, useRecentIDs := range []map[string]bool{recentIDs, nil} {
		if stim := g.pickBestPairStimulus(dims, useRecentIDs, compileCount); stim != nil {
			return stim
		}
		if stim := g.pickWordStimulus(dims, useRecentIDs); stim != nil {
			return stim
		}
	}
	return nil
}

// pickBestPairStimulus selects a Weighted Scale or Prediction Duel pair stimulus.
// Priority: (1) near-threshold confirmation, (2) lowest-confidence probe, (3) challenge.
func (g *Generator) pickBestPairStimulus(dims map[string]dimEntry, excluded map[string]bool, compileCount int32) *dynamo.PulseStimulus {
	type candidate struct {
		pair     signal.Pair
		dim      string
		priority int // lower = higher priority
	}

	var candidates []candidate

	for _, p := range signal.Pairs {
		if excluded[p.PairID] {
			continue
		}
		if p.IntroducedAfterDay > int(compileCount) {
			continue
		}
		for dim := range p.DimensionSignals {
			entry, hasDim := dims[dim]
			if !hasDim {
				// Unknown dimension — treat as lowest confidence; use as generic probe.
				candidates = append(candidates, candidate{pair: p, dim: dim, priority: 2})
				continue
			}
			c := entry.Confidence
			switch {
			case c >= nearThreshLo && c <= nearThreshHi:
				// Near-threshold: highest priority (confirmatory)
				candidates = append(candidates, candidate{pair: p, dim: dim, priority: 1})
			case c < nearThreshLo:
				// Low confidence: second priority (probe)
				candidates = append(candidates, candidate{pair: p, dim: dim, priority: 2})
			case c > challengeConf:
				// High confidence: third priority (challenge)
				candidates = append(candidates, candidate{pair: p, dim: dim, priority: 3})
			}
		}
	}

	if len(candidates) == 0 {
		return nil
	}

	// Sort by priority, shuffle within same priority.
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].priority < candidates[j].priority
	})

	// Pick randomly from the top-priority group.
	top := candidates[0].priority
	var pool []candidate
	for _, c := range candidates {
		if c.priority != top {
			break
		}
		pool = append(pool, c)
	}
	chosen := pool[rand.Intn(len(pool))] // #nosec G404 — non-crypto selection of behavioral stimulus
	p := chosen.pair

	// v1: always weighted_scale. prediction_duel support is stubbed in computePulseSignals
	// and can be activated here once the generation and scoring direction are finalized.
	stimType := "weighted_scale"

	return &dynamo.PulseStimulus{
		StimulusID:      p.PairID,
		Type:            stimType,
		Left:            p.Left,
		Right:           p.Right,
		DimensionProbed: chosen.dim,
	}
}

// pickWordStimulus selects a Reaction Test word stimulus targeting approach_avoidance or openness.
func (g *Generator) pickWordStimulus(dims map[string]dimEntry, excluded map[string]bool) *dynamo.PulseStimulus {
	// Pick whichever word dimension has lower confidence.
	targetDim := "approach_avoidance"
	if aa, ok1 := dims["approach_avoidance"]; ok1 {
		if op, ok2 := dims["openness"]; ok2 && op.Confidence < aa.Confidence {
			targetDim = "openness"
		}
	}

	// Build eligible word pool based on dimension and current score direction.
	var pool []signal.Word
	for _, w := range signal.Words {
		if excluded[w.Text] {
			continue
		}
		switch targetDim {
		case "approach_avoidance":
			pool = append(pool, w) // both directions probe approach_avoidance
		case "openness":
			pool = append(pool, w) // both abstract and concrete probe openness
		}
	}

	if len(pool) == 0 {
		return nil
	}

	w := pool[rand.Intn(len(pool))] // #nosec G404 — non-crypto selection of behavioral stimulus
	return &dynamo.PulseStimulus{
		StimulusID:      w.Text,
		Type:            "reaction_test",
		Word:            w.Text,
		DimensionProbed: targetDim,
	}
}

// selectWordOptions builds the 6 Pick a Word chips.
// Composition: 2 direct probe + 2 confirmatory + 2 archetype stability.
func selectWordOptions(dims map[string]dimEntry, archetype string) []dynamo.PulseWordOption {
	// Determine lower-confidence word dimension for direct probe.
	directDim := "approach_avoidance"
	if aa, ok1 := dims["approach_avoidance"]; ok1 {
		if op, ok2 := dims["openness"]; ok2 && op.Confidence < aa.Confidence {
			directDim = "openness"
		}
	}

	// Build pools by word axis.
	approachWords := filterWords(true, false)
	avoidanceWords := filterWords(false, false)
	abstractWords := filterWords(false, true) // Abstract=true; Approach irrelevant here

	pick2 := func(pool []signal.Word, seen map[string]bool) []dynamo.PulseWordOption {
		var eligible []signal.Word
		for _, w := range pool {
			if !seen[w.Text] {
				eligible = append(eligible, w)
			}
		}
		if len(eligible) == 0 {
			return nil
		}
		rand.Shuffle(len(eligible), func(i, j int) { eligible[i], eligible[j] = eligible[j], eligible[i] })
		var out []dynamo.PulseWordOption
		for i := 0; i < 2 && i < len(eligible); i++ {
			out = append(out, dynamo.PulseWordOption{
				Word:     eligible[i].Text,
				Approach: eligible[i].Approach,
				Abstract: eligible[i].Abstract,
			})
			seen[eligible[i].Text] = true
		}
		return out
	}

	seen := make(map[string]bool)
	var opts []dynamo.PulseWordOption

	// Slot 1 — direct probe (2 words, direction chosen by current score)
	var directPool []signal.Word
	switch directDim {
	case "approach_avoidance":
		entry := dims["approach_avoidance"]
		if entry.Score >= 0.5 {
			directPool = approachWords
		} else {
			directPool = avoidanceWords
		}
	case "openness":
		directPool = abstractWords
	}
	opts = append(opts, pick2(directPool, seen)...)

	// Slot 2 — confirmatory: near-threshold dim, or duplicate direct probe
	confPool := directPool
	for _, wd := range wordDimensions {
		e, ok := dims[wd]
		if ok && e.Confidence >= nearThreshLo && e.Confidence <= nearThreshHi {
			if wd == "approach_avoidance" {
				if e.Score >= 0.5 {
					confPool = approachWords
				} else {
					confPool = avoidanceWords
				}
			} else {
				confPool = abstractWords
			}
			break
		}
	}
	opts = append(opts, pick2(confPool, seen)...)

	// Slot 3 — archetype stability check
	filter, ok := archetypeWordFilter[archetype]
	if !ok {
		filter = archetypeWordFilter["default"]
	}
	var stabilityPool []signal.Word
	if filter.useAbstract {
		stabilityPool = abstractWords
	} else if filter.approach {
		stabilityPool = approachWords
	} else {
		stabilityPool = avoidanceWords
	}
	opts = append(opts, pick2(stabilityPool, seen)...)

	return opts
}

// filterWords returns words from signal.Words matching the given axis filter.
// When filterAbstract=true, filter by Abstract=true (openness probe); otherwise filter by Approach.
func filterWords(approach bool, filterAbstract bool) []signal.Word {
	var out []signal.Word
	for _, w := range signal.Words {
		if filterAbstract {
			if w.Abstract {
				out = append(out, w)
			}
		} else {
			if w.Approach == approach {
				out = append(out, w)
			}
		}
	}
	return out
}

// generateObservations calls Claude Haiku to generate 2-3 pre-written daemon observations
// for the selected stimulus. Returns a map of result_bucket → observation string.
func (g *Generator) generateObservations(ctx context.Context, stim *dynamo.PulseStimulus, archetype string) (map[string]string, error) {
	req := map[string]interface{}{
		"stimulus_type":    stim.Type,
		"word":             stim.Word,
		"left":             stim.Left,
		"right":            stim.Right,
		"dimension_probed": stim.DimensionProbed,
		"result_buckets":   resultBuckets(stim.Type),
		"archetype":        archetype,
	}
	reqJSON, _ := json.Marshal(req)

	systemPrompt := `You generate daemon observation text for a behavioral micro-interaction called The Pulse.

For each result bucket, write one observation (1-2 sentences, max 12 words each).

Rules:
- Daemon voice: second person or observational, contemplative register (like Fraunces italic)
- Never describe the user's action, timing, or what they did. Only express what the daemon reads from the choice.
- The user should feel "how did it know that" — not "oh, it tracked my click speed"
- No behavioral transcript: forbidden phrases include "you moved", "you paused", "you tapped", "you skipped", "quickly", "slowly", "hesitated"
- Match register to archetype where possible — darker for caged_rage, gentler for abandoned_child

Return ONLY valid JSON: { "bucket_name": "observation text", ... }
No markdown, no explanation.`

	payload := map[string]interface{}{
		"model":      pulseModel,
		"max_tokens": pulseMaxTokens,
		"system":     systemPrompt,
		"messages": []map[string]interface{}{
			{"role": "user", "content": string(reqJSON)},
		},
	}
	body, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", g.cfg.AnthropicAPIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := g.httpCl.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anthropic error %d: %s", resp.StatusCode, respBody)
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &apiResp); err != nil || len(apiResp.Content) == 0 {
		return nil, fmt.Errorf("parse anthropic response: %w", err)
	}

	text := stripFence(apiResp.Content[0].Text)
	var obs map[string]string
	if err := json.Unmarshal([]byte(text), &obs); err != nil {
		return nil, fmt.Errorf("parse observation JSON: %w", err)
	}
	return obs, nil
}

// stripFence removes optional markdown code fences (```json ... ``` or ``` ... ```) from Claude's response.
// Mirrors the logic in internal/services/ai/pghelpers.go stripMarkdownFence — that function is unexported
// and lives in a different package, so it cannot be called directly.
func stripFence(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = s[3:]
		if idx := strings.IndexByte(s, '\n'); idx != -1 {
			s = s[idx+1:] // drop optional language tag line (e.g. "json\n")
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	}
	return strings.TrimSpace(s)
}
