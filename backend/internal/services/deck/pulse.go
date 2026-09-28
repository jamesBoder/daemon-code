package deck

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
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/signal"
)

// The Map — folded into the regular deck rotation as the sixth and last
// special middle beat (docs/simplify-pass.md), mutually exclusive with the
// trap/hold/split/cut chain. Unlike its siblings, generating it makes a live
// Anthropic call (plus, previously, a Polly one — voice synthesis is deferred,
// see the plan doc), so it's the only special beat with a real external-
// dependency failure mode; a hedged Map beats no Map, same fallback principle
// the standalone generator used.
const (
	pulseModel       = "claude-haiku-4-5-20251001"
	pulseMaxTokens   = 512
	pulseNodesPerMap = 6

	pulseMinCompiles = 1 // matches the standalone generator's run gate (CompileCount >= 1)
	pulseOdds        = 4 // 1-in-this chance on an eligible (no trap/hold/split/cut) night

	// Tier unlock gates carried over from the standalone generator — currently a
	// no-op in practice (every scenario in signal.Scenarios is TierUniversal;
	// dimensional/personal content is unwritten), kept so it's ready when that
	// content lands rather than needing to be re-derived.
	pulseDimensionalUnlockCompiles = 30
	pulsePersonalUnlockCompiles    = 60

	// Gates the daemon text's own register (early/mid/deep) off mean dimensional
	// confidence — distinct from profile.Stage (cold/warming/running/deep), which
	// governs the rest of the app's voice.
	pulseStageEarlyBelow = 0.35
	pulseStageDeepAbove  = 0.60
)

// pulseAllDimensions is the canonical 10-dimension list from the
// profile_dimensions schema. Duplicated rather than shared, matching the
// existing convention (internal/services/ai/analyst.go's prompt and the old
// internal/services/pulse generator each keep their own copy too).
var pulseAllDimensions = [10]string{
	"openness", "conscientiousness", "agreeableness", "neuroticism",
	"locus_of_control", "approach_avoidance", "temporal_focus",
	"discount_factor", "grim_trigger", "k_level",
}

// pulseTextGenerator produces the pre-generated observation + prediction for a
// Map scenario. Abstracted behind an interface so buildDeck's tests stay
// deterministic and offline — the real implementation calls Anthropic; tests
// inject a fake.
type pulseTextGenerator interface {
	Generate(ctx context.Context, scenario *signal.Scenario, nodes []signal.ScenarioNode, archetype, stage string, confidences map[string]float64) (observation, prediction string, err error)
}

// anthropicPulseGenerator is the real pulseTextGenerator — system prompt,
// model, and request/response shape ported unchanged from the standalone
// internal/services/pulse.Generator.generateDaemonText.
type anthropicPulseGenerator struct {
	apiKey string
	httpCl *http.Client
}

const pulseSystemPrompt = `You generate daemon text for a daily behavioral game called The Map. The user will see a scenario and 6 abstract nodes, and draw wires between the ones that activate for them. Your text is written BEFORE they play.

Write two outputs:

daemon_observation — daemon prose calibrated to profile_stage:
- "early": hedged, e.g. "Something in the pattern. The daemon is still reading."
- "mid": pattern-referencing, e.g. "This room has a wall you've stood against before. The daemon is watching what you do near it."
- "deep": specific and historically-aware, e.g. "Everything you wired today carries weight from behind you. The daemon has seen this before."

HARD RULE — no topology claims: the observation is generated before the user plays. It must make NO assertion about which nodes get wired, the center, the edges, isolation, counts, or density. Reference scenario texture, node themes, and the accumulated profile — claims that survive any wiring, including a session with zero wires. Never describe connection mechanics. Never be traceable to a specific wire. 1-2 sentences.

daemon_prediction — one behavioral prediction sentence. Near-future. Specific enough to be verifiable, oblique enough to be deniable. Never uses the word "predict". Never references the game mechanic.

Voice: daemon register — second person or observational, contemplative (Fraunces italic). Darker for caged_rage, gentler for abandoned_child.

Return ONLY valid JSON: { "daemon_observation": "...", "daemon_prediction": "..." }
No markdown, no explanation.`

func (a *anthropicPulseGenerator) Generate(ctx context.Context, scenario *signal.Scenario, nodes []signal.ScenarioNode, archetype, stage string, confidences map[string]float64) (string, string, error) {
	nodeTexts := make([]string, 0, len(nodes))
	for _, n := range nodes {
		nodeTexts = append(nodeTexts, n.Text)
	}

	req := map[string]interface{}{
		"scenario":      scenario.Text,
		"scenario_type": string(scenario.Type),
		"nodes":         nodeTexts,
		"archetype":     archetype,
		"profile_stage": stage,
		"confidences":   confidences,
	}
	reqJSON, _ := json.Marshal(req)

	payload := map[string]interface{}{
		"model":      pulseModel,
		"max_tokens": pulseMaxTokens,
		"system":     pulseSystemPrompt,
		"messages": []map[string]interface{}{
			{"role": "user", "content": string(reqJSON)},
		},
	}
	body, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", a.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := a.httpCl.Do(httpReq)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("anthropic error %d: %s", resp.StatusCode, respBody)
	}

	var apiResp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &apiResp); err != nil || len(apiResp.Content) == 0 {
		return "", "", fmt.Errorf("parse anthropic response: %w", err)
	}

	text := pulseStripFence(apiResp.Content[0].Text)
	var out struct {
		DaemonObservation string `json:"daemon_observation"`
		DaemonPrediction  string `json:"daemon_prediction"`
	}
	if err := json.Unmarshal([]byte(text), &out); err != nil {
		return "", "", fmt.Errorf("parse daemon text JSON: %w", err)
	}
	if out.DaemonObservation == "" || out.DaemonPrediction == "" {
		return "", "", fmt.Errorf("daemon text incomplete")
	}
	return out.DaemonObservation, out.DaemonPrediction, nil
}

// pulseStripFence removes optional markdown code fences from Claude's
// response. Mirrors internal/services/ai's stripMarkdownFence, which is
// unexported in a different package.
func pulseStripFence(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = s[3:]
		if idx := strings.IndexByte(s, '\n'); idx != -1 {
			s = s[idx+1:]
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	}
	return strings.TrimSpace(s)
}

// parsePulseConfidences reads per-dimension confidence out of the profile_dimensions
// JSONB. A missing dimension (including the entire blob on Day 0) reads as
// confidence 0 — informative, not an error.
func parsePulseConfidences(raw []byte) map[string]float64 {
	out := make(map[string]float64, len(pulseAllDimensions))
	var dims map[string]struct {
		Confidence float64 `json:"confidence"`
	}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &dims) // tolerate parse failure; falls through to all-zero
	}
	for _, name := range pulseAllDimensions {
		out[name] = dims[name].Confidence
	}
	return out
}

// pulseMaxAllowedTier returns the highest scenario tier unlocked at this
// compile count.
func pulseMaxAllowedTier(compileCount int32) signal.ScenarioTier {
	switch {
	case compileCount >= pulsePersonalUnlockCompiles:
		return signal.TierPersonal
	case compileCount >= pulseDimensionalUnlockCompiles:
		return signal.TierDimensional
	default:
		return signal.TierUniversal
	}
}

func pulseTierAllowed(tier, maxTier signal.ScenarioTier) bool {
	rank := map[signal.ScenarioTier]int{
		signal.TierUniversal:   0,
		signal.TierDimensional: 1,
		signal.TierPersonal:    2,
	}
	return rank[tier] <= rank[maxTier]
}

// selectPulseScenario picks the scenario whose DimensionAffinity targets the
// lowest-confidence dimensions. Simplified from the standalone generator's
// 14-day repeat gap (which needed a dedicated GetRecentPulseResponses query)
// down to the same one-night exclusion every other special beat uses
// (docs/simplify-pass.md) — harmonizes with how Trap/Hold/Split/Cut already
// work rather than keeping Pulse as the one exception.
func selectPulseScenario(dims map[string]float64, exclude map[string]bool, compileCount int32) *signal.Scenario {
	maxTier := pulseMaxAllowedTier(compileCount)

	var eligible []*signal.Scenario
	for i := range signal.Scenarios {
		s := &signal.Scenarios[i]
		if !pulseTierAllowed(s.Tier, maxTier) {
			continue
		}
		if s.IntroducedAfterDay > int(compileCount) {
			continue
		}
		eligible = append(eligible, s)
	}
	if len(eligible) == 0 {
		return nil
	}

	var fresh []*signal.Scenario
	for _, s := range eligible {
		if !exclude[s.ScenarioID] {
			fresh = append(fresh, s)
		}
	}
	if len(fresh) > 0 {
		return pulseLowestConfidenceAffinity(fresh, dims)
	}
	// Relaxation: every eligible scenario was served last night — a small
	// library early on. Pick among all of them rather than skip the beat.
	return pulseLowestConfidenceAffinity(eligible, dims)
}

// pulseLowestConfidenceAffinity returns the scenario whose affinity dimensions
// have the lowest mean confidence, choosing randomly among near-ties.
func pulseLowestConfidenceAffinity(pool []*signal.Scenario, dims map[string]float64) *signal.Scenario {
	type scored struct {
		s     *signal.Scenario
		score float64
	}
	scoredPool := make([]scored, 0, len(pool))
	for _, s := range pool {
		if len(s.DimensionAffinity) == 0 {
			scoredPool = append(scoredPool, scored{s: s, score: 1.0})
			continue
		}
		var sum float64
		for _, dim := range s.DimensionAffinity {
			sum += dims[dim]
		}
		scoredPool = append(scoredPool, scored{s: s, score: sum / float64(len(s.DimensionAffinity))})
	}

	rand.Shuffle(len(scoredPool), func(i, j int) { scoredPool[i], scoredPool[j] = scoredPool[j], scoredPool[i] }) // #nosec G404 — non-crypto tie-break
	sort.SliceStable(scoredPool, func(i, j int) bool { return scoredPool[i].score < scoredPool[j].score })
	return scoredPool[0].s
}

// selectPulseNodes picks pulseNodesPerMap nodes from the scenario pool,
// weighted toward the dimensions the profile is least confident about.
func selectPulseNodes(scenario *signal.Scenario, dims map[string]float64) []signal.ScenarioNode {
	type scored struct {
		node signal.ScenarioNode
		gap  float64
	}
	pool := make([]scored, 0, len(scenario.NodePool))
	for _, n := range scenario.NodePool {
		var gap float64
		for dim := range n.DimensionSignals {
			gap += 1.0 - dims[dim]
		}
		pool = append(pool, scored{node: n, gap: gap})
	}

	rand.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] }) // #nosec G404 — non-crypto tie-break
	sort.SliceStable(pool, func(i, j int) bool { return pool[i].gap > pool[j].gap })

	count := pulseNodesPerMap
	if count > len(pool) {
		count = len(pool)
	}
	out := make([]signal.ScenarioNode, 0, count)
	for i := 0; i < count; i++ {
		out = append(out, pool[i].node)
	}
	return out
}

// pulseTextStage maps mean dimensional confidence to the daemon text's
// register (early/mid/deep) — see the const block above for why this is
// distinct from profile.Stage.
func pulseTextStage(dims map[string]float64) string {
	var sum float64
	for _, name := range pulseAllDimensions {
		sum += dims[name]
	}
	mean := sum / float64(len(pulseAllDimensions))
	switch {
	case mean < pulseStageEarlyBelow:
		return "early"
	case mean > pulseStageDeepAbove:
		return "deep"
	default:
		return "mid"
	}
}

// pulseNodePayload and pulseScenarioPayload mirror the shape the standalone
// /pulse endpoint already serves (internal/handlers/pulse.go) so a future
// frontend conversion to a registry entry is a near-direct port. Dimension
// tags are deliberately absent — server-only, same precedent as Cut's
// temporal tags (signal.LookupCutItem) and Stroop's axis recovery: the
// Analyst recovers them via signal.LookupScenarioNode(scenario_id, node_id),
// never from the echoed copy.
type pulseNodePayload struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// buildPulse stamps The Map into tonight's deck. Returns ok=false when there's
// no text generator configured (buildDeck's tests use a zero-value Generator
// and never exercise this beat) or the scenario library has nothing eligible.
// On an Anthropic failure, falls back to hedged stock text — a hedged Map
// beats no Map, same principle the standalone generator used — rather than
// failing the whole night's deck.
func buildPulse(ctx context.Context, gen pulseTextGenerator, profile db.ShadowProfile, exclude map[string]bool) (dynamo.Fragment, bool) {
	if gen == nil {
		return dynamo.Fragment{}, false
	}

	dims := parsePulseConfidences(profile.ProfileDimensions)
	scenario := selectPulseScenario(dims, exclude, profile.CompileCount)
	if scenario == nil {
		return dynamo.Fragment{}, false
	}
	nodes := selectPulseNodes(scenario, dims)

	archetype := profile.PrimaryArchetype
	if archetype == "" {
		archetype = "default"
	}
	stage := pulseTextStage(dims)

	obs, pred, err := gen.Generate(ctx, scenario, nodes, archetype, stage, dims)
	if err != nil {
		obs = signal.FallbackObservation
		pred = signal.FallbackPredictions[rand.Intn(len(signal.FallbackPredictions))] // #nosec G404 — non-crypto content selection
	}

	nodePayloads := make([]pulseNodePayload, len(nodes))
	for i, n := range nodes {
		nodePayloads[i] = pulseNodePayload{ID: n.NodeID, Text: n.Text}
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"type":               "pulse",
		"scenario_id":        scenario.ScenarioID,
		"scenario_type":      string(scenario.Type),
		"text":               scenario.Text,
		"daemon_observation": obs,
		"daemon_prediction":  pred,
		"nodes":              nodePayloads,
	})

	return dynamo.Fragment{
		ID:      uuid.New().String(),
		Type:    "pulse",
		Payload: string(payload),
	}, true
}
