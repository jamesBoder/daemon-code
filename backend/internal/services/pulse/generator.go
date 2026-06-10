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
	"time"

	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/signal"
)

const (
	pulseModel     = "claude-haiku-4-5-20251001"
	pulseMaxTokens = 512

	nodesPerMap = 6

	// Tier unlock gates in compile-count units (the profile has no account-age field).
	dimensionalUnlockCompiles = 30
	personalUnlockCompiles    = 60

	// profile_stage thresholds on mean dimensional confidence.
	stageEarlyBelow = 0.35
	stageDeepAbove  = 0.60
)

// allDimensions is the canonical 10-dimension list from the profile_dimensions schema.
// Dimensions absent from the profile count as confidence 0 (a sparse profile is early).
var allDimensions = [10]string{
	"openness", "conscientiousness", "agreeableness", "neuroticism",
	"locus_of_control", "approach_avoidance", "temporal_focus",
	"discount_factor", "grim_trigger", "k_level",
}

// dimEntry mirrors the profile_dimensions JSONB entry shape.
type dimEntry struct {
	Score      float64 `json:"score"`
	Confidence float64 `json:"confidence"`
	N          int     `json:"n"`
}

// Generator runs nightly to select one Map scenario per user and generate the
// daemon observation + prediction.
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
	lastPlayed := make(map[string]time.Time, len(recentPulse))
	for _, r := range recentPulse {
		t := r.SessionDate.Time
		if existing, ok := lastPlayed[r.FragmentID]; !ok || t.After(existing) {
			lastPlayed[r.FragmentID] = t
		}
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

	// --- Phase A: select scenario + nodes algorithmically (no Claude) ---
	scenario := selectScenario(dims, lastPlayed, profile.CompileCount)
	if scenario == nil {
		// Empty library only — relaxation otherwise always yields a scenario.
		return nil
	}
	nodes := selectNodes(scenario, dims)

	// --- Phase B: Claude generates observation + prediction (one call) ---
	confidences := make(map[string]float64, len(allDimensions))
	for _, dim := range allDimensions {
		confidences[dim] = dims[dim].Confidence // confidence levels only — never raw scores
	}
	obs, pred, err := g.generateDaemonText(ctx, scenario, nodes, archetype, profileStage(dims), confidences)
	if err != nil {
		// Failure fallback: a hedged Map beats no Map.
		obs = signal.FallbackObservation
		pred = signal.FallbackPredictions[rand.Intn(len(signal.FallbackPredictions))] // #nosec G404 — non-crypto content selection
	}

	// --- Write to DynamoDB ---
	item := dynamo.PulseItem{
		UserID: userID,
		Scenario: dynamo.PulseScenario{
			ScenarioID:       scenario.ScenarioID,
			Type:             string(scenario.Type),
			Tier:             string(scenario.Tier),
			Text:             scenario.Text,
			DaemonObs:        obs,
			DaemonPrediction: pred,
		},
		Nodes: make([]dynamo.PulseNode, 0, len(nodes)),
	}
	for _, n := range nodes {
		sigs := make(map[string]dynamo.PulseNodeSignal, len(n.DimensionSignals))
		for dim, s := range n.DimensionSignals {
			sigs[dim] = dynamo.PulseNodeSignal{Direction: s.Direction}
		}
		item.Nodes = append(item.Nodes, dynamo.PulseNode{
			NodeID:           n.NodeID,
			Text:             n.Text,
			DimensionSignals: sigs,
		})
	}
	return g.ddb.PutPulse(ctx, item)
}

// maxAllowedTier returns the highest tier unlocked at this compile count.
func maxAllowedTier(compileCount int32) signal.ScenarioTier {
	switch {
	case compileCount >= personalUnlockCompiles:
		return signal.TierPersonal
	case compileCount >= dimensionalUnlockCompiles:
		return signal.TierDimensional
	default:
		return signal.TierUniversal
	}
}

func tierAllowed(tier signal.ScenarioTier, maxTier signal.ScenarioTier) bool {
	rank := map[signal.ScenarioTier]int{
		signal.TierUniversal:   0,
		signal.TierDimensional: 1,
		signal.TierPersonal:    2,
	}
	return rank[tier] <= rank[maxTier]
}

// selectScenario picks the scenario whose DimensionAffinity targets the
// lowest-confidence dimensions, enforcing the 14-day repeat gap.
// Relaxation fallback: if every eligible scenario was played within the gap
// window (zero library headroom), pick the least-recently-played one instead
// of skipping the day.
func selectScenario(dims map[string]dimEntry, lastPlayed map[string]time.Time, compileCount int32) *signal.Scenario {
	maxTier := maxAllowedTier(compileCount)

	var eligible []*signal.Scenario
	for i := range signal.Scenarios {
		s := &signal.Scenarios[i]
		if !tierAllowed(s.Tier, maxTier) {
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

	// Pass 1: enforce repeat gap (GetRecentPulseResponses already windows to 14 days).
	var fresh []*signal.Scenario
	for _, s := range eligible {
		if _, played := lastPlayed[s.ScenarioID]; !played {
			fresh = append(fresh, s)
		}
	}
	if len(fresh) > 0 {
		return lowestConfidenceAffinity(fresh, dims)
	}

	// Relaxation: all eligible scenarios sit inside the gap window, so every
	// play date is visible — take the least recently played.
	sort.Slice(eligible, func(i, j int) bool {
		return lastPlayed[eligible[i].ScenarioID].Before(lastPlayed[eligible[j].ScenarioID])
	})
	return eligible[0]
}

// lowestConfidenceAffinity returns the scenario whose affinity dimensions have
// the lowest mean confidence, choosing randomly among near-ties.
func lowestConfidenceAffinity(pool []*signal.Scenario, dims map[string]dimEntry) *signal.Scenario {
	type scored struct {
		s     *signal.Scenario
		score float64 // mean confidence of affinity dims; lower = better target
	}
	scoredPool := make([]scored, 0, len(pool))
	for _, s := range pool {
		if len(s.DimensionAffinity) == 0 {
			scoredPool = append(scoredPool, scored{s: s, score: 1.0})
			continue
		}
		var sum float64
		for _, dim := range s.DimensionAffinity {
			sum += dims[dim].Confidence // missing dim = zero value = confidence 0
		}
		scoredPool = append(scoredPool, scored{s: s, score: sum / float64(len(s.DimensionAffinity))})
	}

	rand.Shuffle(len(scoredPool), func(i, j int) { scoredPool[i], scoredPool[j] = scoredPool[j], scoredPool[i] }) // #nosec G404 — non-crypto tie-break
	sort.SliceStable(scoredPool, func(i, j int) bool { return scoredPool[i].score < scoredPool[j].score })
	return scoredPool[0].s
}

// selectNodes picks 6 nodes from the scenario pool, weighted toward the
// dimensions the profile is least confident about. The obliqueness rule is
// enforced at the content level (curation), not here.
func selectNodes(scenario *signal.Scenario, dims map[string]dimEntry) []signal.ScenarioNode {
	type scored struct {
		node signal.ScenarioNode
		gap  float64 // summed (1 - confidence) over the node's tagged dims; higher = better probe
	}
	pool := make([]scored, 0, len(scenario.NodePool))
	for _, n := range scenario.NodePool {
		var gap float64
		for dim := range n.DimensionSignals {
			gap += 1.0 - dims[dim].Confidence // missing dim = confidence 0 = max gap
		}
		pool = append(pool, scored{node: n, gap: gap})
	}

	rand.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] }) // #nosec G404 — non-crypto tie-break
	sort.SliceStable(pool, func(i, j int) bool { return pool[i].gap > pool[j].gap })

	count := nodesPerMap
	if count > len(pool) {
		count = len(pool)
	}
	out := make([]signal.ScenarioNode, 0, count)
	for i := 0; i < count; i++ {
		out = append(out, pool[i].node)
	}
	return out
}

// profileStage maps mean dimensional confidence to the Phase B prose register.
func profileStage(dims map[string]dimEntry) string {
	var sum float64
	for _, dim := range allDimensions {
		sum += dims[dim].Confidence // missing = 0
	}
	mean := sum / float64(len(allDimensions))
	switch {
	case mean < stageEarlyBelow:
		return "early"
	case mean > stageDeepAbove:
		return "deep"
	default:
		return "mid"
	}
}

// generateDaemonText calls Claude Haiku once to produce the pre-generated
// observation and prediction for tomorrow's Map.
func (g *Generator) generateDaemonText(ctx context.Context, scenario *signal.Scenario, nodes []signal.ScenarioNode, archetype, stage string, confidences map[string]float64) (string, string, error) {
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

	systemPrompt := `You generate daemon text for a daily behavioral game called The Map. The user will see a scenario and 6 abstract nodes, and draw wires between the ones that activate for them. Your text is written BEFORE they play.

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
		return "", "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", g.cfg.AnthropicAPIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := g.httpCl.Do(httpReq)
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

	text := stripFence(apiResp.Content[0].Text)
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
