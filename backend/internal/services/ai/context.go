package ai

import (
	"encoding/json"
	"math"
	"time"

	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/signal"
)

const (
	minReactionSamples     = 3     // minimum taps for a statistically meaningful session signal
	sessionQualityLowSD    = 80.0  // ms SD below which session is "low" quality (disengaged, uniform taps)
	sessionQualityMedSD    = 200.0 // ms SD below which session is "medium" quality
	neuroVarNormCeiling    = 400.0 // ms SD that maps to neuroVarSig=1.0; taps above this are max-variance
	grimTriggerMinCompiles = 6     // minimum compiles before grim trigger is evaluated (insufficient baseline before this)
	grimTriggerMinDrop     = 5     // accuracy point drop required to detect grim trigger
	grimTriggerMedDrop     = 10    // medium magnitude floor
	grimTriggerHighDrop    = 20    // high magnitude floor

	// Confidence decay parameters — applied to profile_dimensions once per compile.
	// Decay is a function of days absent, not days elapsed since last compile, so
	// running it twice for the same compile produces the same result (idempotent).
	confidenceDecayGraceDays  = 14    // days of absence before any decay begins
	confidenceDecayRatePerDay = 0.005 // fractional confidence lost per day beyond grace
	confidenceDecayFloorMult  = 0.60  // multiplier floor: maximum 40% total decay
	confidenceDecayFloorMin   = 0.10  // absolute confidence floor regardless of absence

	// maxTimingMs is an upper-bound sanity cap for user-timing fields (deliberation, duel response).
	// Guards against epoch-magnitude values (~1.7e12 ms) that occur when the frontend's
	// useEffect timing ref fires after a fast interaction — the > 0 guard alone is insufficient.
	maxTimingMs = 300_000 // 5 minutes; any real user interaction is far below this
)

// analystContext is the complete pre-computed context object passed to the Analyst Lambda.
// All cross-session aggregation, behavioral signal tagging, and quality assessment is done
// in Go before the API call. The Lambda receives this and executes without querying history.
type analystContext struct {
	CardResponses         []db.CardResponse      `json:"card_responses"`
	MoodLog               []db.MoodLog           `json:"mood_log"`
	CurrentProfile        db.ShadowProfile       `json:"current_profile"`
	ProfileDimensions     json.RawMessage        `json:"profile_dimensions"`
	ProfileDimensionsPrev json.RawMessage        `json:"profile_dimensions_prev"`
	SessionQuality        sessionQualityCtx      `json:"session_quality"`
	DimensionSignalsToday map[string]interface{} `json:"dimension_signals_today"`
	PulseSignalsToday     map[string]interface{} `json:"pulse_signals_today,omitempty"`
	GrimTriggerSignal     grimTriggerCtx         `json:"grim_trigger_signal"`
	KLevelSignal          kLevelCtx              `json:"k_level_signal"`
	ExistingPatterns      []existingPattern      `json:"existing_patterns"`
}

// existingPattern is the compact view of a current process the Analyst needs in
// order to reference it by id — to strengthen, rename, change state, or fold a
// provisionally-seeded one. Without this the model can only ever create new
// patterns, never update them.
type existingPattern struct {
	PatternID string `json:"pattern_id"`
	Name      string `json:"name,omitempty"`
	State     string `json:"state"`
	Strength  int32  `json:"strength"`
	Unnamed   bool   `json:"unnamed"`
	SignalKey string `json:"signal_key,omitempty"`
}

// toExistingPatterns projects the pattern library into the compact context view.
// Strength is the authoritative base (live drift is reset this compile anyway).
func toExistingPatterns(patterns []db.PatternLibrary) []existingPattern {
	out := make([]existingPattern, 0, len(patterns))
	for _, p := range patterns {
		name := ""
		if p.Name.Valid {
			name = p.Name.String
		}
		out = append(out, existingPattern{
			PatternID: p.ID.String(),
			Name:      name,
			State:     p.State,
			Strength:  p.Strength,
			Unnamed:   p.Unnamed,
			SignalKey: p.SignalKey,
		})
	}
	return out
}

type sessionQualityCtx struct {
	Level         string  `json:"level"`
	AvgReactionMs float64 `json:"avg_reaction_ms"`
	VarianceMs    float64 `json:"variance_ms"`
}

type grimTriggerCtx struct {
	Detected         bool   `json:"detected"`
	Magnitude        string `json:"magnitude,omitempty"`
	SessionsObserved int    `json:"sessions_observed,omitempty"`
	TriggerType      string `json:"trigger_type,omitempty"`
}

type kLevelCtx struct {
	AvgDeliberationRatio float64 `json:"avg_deliberation_ratio"`
	N                    int     `json:"n"`
}

// --- Response data shapes (must match frontend output) ---

type rtResponseData struct {
	Tapped []struct {
		Word           string `json:"word"`
		ReactionTimeMs int    `json:"reactionTimeMs"`
	} `json:"tapped"`
	Total int `json:"total"`
}

// WeightedScale returns an array of results (one per pair in the fragment).
type wsResultItem struct {
	Left               string  `json:"left"`
	Right              string  `json:"right"`
	Value              float64 `json:"value"` // -1.0 = full left, 0 = center, 1.0 = full right
	DeliberationTimeMs int     `json:"deliberationTimeMs"`
}

// SpeedRound returns an array of results (one per prompt in the fragment).
// Both deck speed rounds and the onboarding speed round produce this shape.
type srResultItem struct {
	Starter        string `json:"starter"`
	Chosen         string `json:"chosen"`
	ResponseTimeMs int    `json:"responseTimeMs"`
}

type duelResponseData struct {
	Matched            bool `json:"matched"`
	DuelResponseTimeMs int  `json:"duelResponseTimeMs"`
}

// assembleContext builds the full Analyst context object from today's data and the user's profile.
// recentResponses should be card_responses from the last 7 session dates for cross-session signals.
// lastCompile is the timestamp of the previous compile (profile.UpdatedAt); zero value skips decay.
func assembleContext(
	responses []db.CardResponse,
	moods []db.MoodLog,
	profile db.ShadowProfile,
	recentResponses []db.CardResponse,
	lastCompile time.Time,
) analystContext {
	ac := analystContext{
		CardResponses:  responses,
		MoodLog:        moods,
		CurrentProfile: profile,
	}
	if len(profile.ProfileDimensions) > 0 {
		ac.ProfileDimensions = decayDimensions(json.RawMessage(profile.ProfileDimensions), lastCompile, time.Now().UTC())
	}
	if len(profile.ProfileDimensionsPrev) > 0 {
		ac.ProfileDimensionsPrev = json.RawMessage(profile.ProfileDimensionsPrev)
	}

	sessionResponses := filterNonPulse(responses)
	reactionTimes := collectReactionTimes(sessionResponses)
	ac.SessionQuality = computeSessionQuality(reactionTimes)
	ac.DimensionSignalsToday = computeDimensionSignals(sessionResponses, reactionTimes)
	ac.PulseSignalsToday = computePulseSignals(responses)
	ac.GrimTriggerSignal = computeGrimTrigger(profile, recentResponses)
	ac.KLevelSignal = computeKLevel(recentResponses)

	return ac
}

// collectReactionTimes extracts all tap reaction times from reaction_test responses.
func collectReactionTimes(responses []db.CardResponse) []float64 {
	var times []float64
	for _, r := range responses {
		if r.FragmentType != "reaction_test" {
			continue
		}
		var rd rtResponseData
		if json.Unmarshal(r.ResponseData, &rd) != nil {
			continue
		}
		for _, tap := range rd.Tapped {
			if tap.ReactionTimeMs > 0 {
				times = append(times, float64(tap.ReactionTimeMs))
			}
		}
	}
	return times
}

// computeSessionQuality assesses data quality from reaction time distribution.
// Low standard deviation signals disengagement (uniform, rushed responses).
func computeSessionQuality(reactionTimes []float64) sessionQualityCtx {
	if len(reactionTimes) < minReactionSamples {
		return sessionQualityCtx{Level: "low"}
	}

	avg := floatMean(reactionTimes)
	sd := floatStdDev(reactionTimes)

	level := "high"
	switch {
	case sd < sessionQualityLowSD:
		level = "low"
	case sd < sessionQualityMedSD:
		level = "medium"
	}

	return sessionQualityCtx{
		Level:         level,
		AvgReactionMs: roundTo1(avg),
		VarianceMs:    roundTo1(sd),
	}
}

// computeDimensionSignals produces per-dimension behavioral signals from today's session.
// Only dimensions with observed data appear in the returned map.
func computeDimensionSignals(responses []db.CardResponse, reactionTimes []float64) map[string]interface{} {
	out := make(map[string]interface{})

	// --- Word-based: approach_avoidance and openness ---
	approachN, avoidanceN := 0, 0
	abstractN, concreteN := 0, 0

	for _, r := range responses {
		if r.FragmentType != "reaction_test" {
			continue
		}
		var rd rtResponseData
		if json.Unmarshal(r.ResponseData, &rd) != nil {
			continue
		}
		for _, tap := range rd.Tapped {
			w, ok := signal.Lookup(tap.Word)
			if !ok {
				continue
			}
			if w.Approach {
				approachN++
			} else {
				avoidanceN++
			}
			if w.Abstract {
				abstractN++
			} else {
				concreteN++
			}
		}
	}

	if n := approachN + avoidanceN; n > 0 {
		out["approach_avoidance"] = map[string]interface{}{
			"signal":  round2(float64(approachN) / float64(n)),
			"n_words": n,
		}
	}
	if n := abstractN + concreteN; n > 0 {
		out["openness"] = map[string]interface{}{
			"signal":  round2(float64(abstractN) / float64(n)),
			"n_words": n,
		}
	}

	// --- Neuroticism from reaction time variance ---
	var neuroVarSig float64
	var neuroSD float64
	hasVarNeuro := len(reactionTimes) >= minReactionSamples
	if hasVarNeuro {
		neuroSD = floatStdDev(reactionTimes)
		neuroVarSig = math.Min(1.0, neuroSD/neuroVarNormCeiling)
		out["neuroticism"] = map[string]interface{}{
			"signal":               round2(neuroVarSig),
			"reaction_variance_ms": roundTo1(neuroSD),
		}
	}

	// --- Scale-based dimensions ---
	dimSums := make(map[string]float64)
	dimCounts := make(map[string]int)
	var deliberationMs []float64

	for _, r := range responses {
		if r.FragmentType != "weighted_scale" {
			continue
		}
		var results []wsResultItem
		if json.Unmarshal(r.ResponseData, &results) != nil {
			continue
		}
		for _, res := range results {
			if res.DeliberationTimeMs > 0 && res.DeliberationTimeMs < maxTimingMs {
				deliberationMs = append(deliberationMs, float64(res.DeliberationTimeMs))
			}
			pair, ok := signal.LookupPair(res.Left, res.Right)
			if !ok {
				continue
			}
			for dim, sig := range pair.DimensionSignals {
				dimSums[dim] += scaleScore(res.Value, sig.LeftHigh)
				dimCounts[dim]++
			}
		}
	}

	// --- Speed-round-based dimensions (tagged options feed the same sums) ---
	for _, r := range responses {
		if r.FragmentType != "speed_round" {
			continue
		}
		var results []srResultItem
		if json.Unmarshal(r.ResponseData, &results) != nil {
			continue
		}
		for _, res := range results {
			opt, ok := signal.LookupSpeedOption(res.Starter, res.Chosen)
			if !ok {
				continue
			}
			for dim, sig := range opt.DimensionSignals {
				dimSums[dim] += sig
				dimCounts[dim]++
			}
		}
	}

	avgDelibMs := 0.0
	if len(deliberationMs) > 0 {
		avgDelibMs = math.Round(floatMean(deliberationMs))
	}

	for dim, sum := range dimSums {
		n := dimCounts[dim]
		sig := round2(sum / float64(n))

		switch dim {
		case "neuroticism":
			// Merge scale signal with variance-based signal when both are available.
			if hasVarNeuro {
				merged := round2((neuroVarSig + sig) / 2)
				out["neuroticism"] = map[string]interface{}{
					"signal":               merged,
					"reaction_variance_ms": roundTo1(neuroSD),
					"n_pairs":              n,
				}
			} else {
				out["neuroticism"] = map[string]interface{}{
					"signal":  sig,
					"n_pairs": n,
				}
			}
		case "conscientiousness":
			entry := map[string]interface{}{
				"signal":  sig,
				"n_pairs": n,
			}
			if avgDelibMs > 0 {
				entry["avg_deliberation_ms"] = avgDelibMs
			}
			out["conscientiousness"] = entry
		default:
			out[dim] = map[string]interface{}{
				"signal":  sig,
				"n_pairs": n,
			}
		}
	}

	return out
}

// SessionSignal is one dimension's deterministic read from a single session:
// a 0.0–1.0 (k_level 0.0–4.0) value and the number of observations backing it.
type SessionSignal struct {
	Dimension string
	Signal    float64
	N         int
}

// SessionDimensionSignals runs the deterministic dimension engine on one
// session's responses and returns typed per-dimension signals. Exported so the
// live, non-AI session-complete path (services/observe) can reuse the exact
// engine the nightly Analyst uses — no duplicated parsing, no model call.
func SessionDimensionSignals(responses []db.CardResponse) []SessionSignal {
	session := filterNonPulse(responses)
	raw := computeDimensionSignals(session, collectReactionTimes(session))

	out := make([]SessionSignal, 0, len(raw))
	for dim, v := range raw {
		m, ok := v.(map[string]interface{})
		if !ok {
			continue
		}
		sig, _ := m["signal"].(float64)
		n := 0
		// computeDimensionSignals tags counts as n_words (reaction tests) or
		// n_pairs (scales/speed); variance-only neuroticism carries neither.
		if nw, ok := m["n_words"].(int); ok {
			n = nw
		}
		if np, ok := m["n_pairs"].(int); ok {
			n = np
		}
		out = append(out, SessionSignal{Dimension: dim, Signal: sig, N: n})
	}
	return out
}

// scaleScore converts a WeightedScale value (-1.0..+1.0) to a 0.0..1.0 dimension signal.
// leftHigh=true means the left option scores high on this dimension.
func scaleScore(value float64, leftHigh bool) float64 {
	value = math.Max(-1.0, math.Min(1.0, value))
	if leftHigh {
		return (-value + 1) / 2
	}
	return (value + 1) / 2
}

// computeGrimTrigger detects whether the last compile produced a significant accuracy drop.
// Only meaningful after ≥6 compiles (insufficient baseline before that).
func computeGrimTrigger(profile db.ShadowProfile, recentResponses []db.CardResponse) grimTriggerCtx {
	if profile.CompileCount < grimTriggerMinCompiles {
		return grimTriggerCtx{Detected: false}
	}
	drop := profile.DaemonAccuracyLastCompile - profile.DaemonAccuracy
	if drop < grimTriggerMinDrop {
		return grimTriggerCtx{Detected: false}
	}

	magnitude := "low"
	switch {
	case drop >= grimTriggerHighDrop:
		magnitude = "high"
	case drop >= grimTriggerMedDrop:
		magnitude = "medium"
	}

	return grimTriggerCtx{
		Detected:         true,
		Magnitude:        magnitude,
		SessionsObserved: countUniqueDates(recentResponses),
		TriggerType:      "daemon_miss",
	}
}

// computeKLevel computes the K-level deliberation ratio across recent sessions.
// Ratio = avg_duel_response_ms / avg_reaction_ms within each session, then averaged across sessions.
// Per-session ratio controls for uniform slow/fast sessions; only sessions with both
// reaction_test and prediction_duel data contribute to N.
func computeKLevel(recentResponses []db.CardResponse) kLevelCtx {
	sessions := groupResponsesByDate(recentResponses)

	var ratios []float64
	for _, resps := range sessions {
		rtTimes := collectReactionTimes(resps)
		if len(rtTimes) == 0 {
			continue
		}
		avgRT := floatMean(rtTimes)
		if avgRT == 0 {
			continue
		}

		var duelTimes []float64
		for _, r := range resps {
			if r.FragmentType != "prediction_duel" {
				continue
			}
			var d duelResponseData
			if json.Unmarshal(r.ResponseData, &d) != nil {
				continue
			}
			if d.DuelResponseTimeMs > 0 && d.DuelResponseTimeMs < maxTimingMs {
				duelTimes = append(duelTimes, float64(d.DuelResponseTimeMs))
			}
		}
		if len(duelTimes) == 0 {
			continue
		}

		ratios = append(ratios, floatMean(duelTimes)/avgRT)
	}

	if len(ratios) == 0 {
		return kLevelCtx{}
	}
	return kLevelCtx{
		AvgDeliberationRatio: round2(floatMean(ratios)),
		N:                    len(ratios),
	}
}

// groupResponsesByDate groups card responses by their session_date string key.
func groupResponsesByDate(responses []db.CardResponse) map[string][]db.CardResponse {
	m := make(map[string][]db.CardResponse)
	for _, r := range responses {
		if !r.SessionDate.Valid {
			continue
		}
		key := r.SessionDate.Time.Format("2006-01-02")
		m[key] = append(m[key], r)
	}
	return m
}

// countUniqueDates returns the number of distinct session dates in the response set.
func countUniqueDates(responses []db.CardResponse) int {
	seen := make(map[string]bool)
	for _, r := range responses {
		if r.SessionDate.Valid {
			seen[r.SessionDate.Time.Format("2006-01-02")] = true
		}
	}
	return len(seen)
}

// filterNonPulse returns responses that are NOT from the Pulse feature.
// Pulse responses (fragment_type == "pulse") must be excluded from session_quality
// and main dimension signals — they are processed separately in computePulseSignals.
func filterNonPulse(responses []db.CardResponse) []db.CardResponse {
	out := make([]db.CardResponse, 0, len(responses))
	for _, r := range responses {
		if r.FragmentType != "pulse" {
			out = append(out, r)
		}
	}
	return out
}

// Map signal computation weights (The Map spec, Signal Computation section).
const (
	pulseConfidenceModifier = 0.75 // richer than a single reaction (×0.5), less rich than a full session

	mapCenterWeight     = 1.5 // wire to the center scenario anchor
	mapOneSidedWeight   = 0.5 // dimension tagged on only one endpoint of a wire
	mapIsolatedWeight   = 0.5 // isolated node, opposite pole of its primary dimension
	mapFirstWireWeight  = 1.3
	mapSecondWireWeight = 1.0
	mapThirdWireWeight  = 0.8
)

// pulseMapConnection mirrors the POST /pulse/response connection shape.
type pulseMapConnection struct {
	A string `json:"a"`
	B string `json:"b"`
}

// pulseMapResponseData is the connections-based response_data shape written by
// the Map handler. Connections is a pointer so a missing key (old stimulus-shape
// rows from the deploy window) is distinguishable from an explicit empty array
// (a valid zero-wire sparse session).
type pulseMapResponseData struct {
	ScenarioID       string                `json:"scenario_id"`
	Connections      *[]pulseMapConnection `json:"connections"`
	IsolatedNodes    []string              `json:"isolated_nodes"`
	FirstWireDelayMs *int64                `json:"first_wire_delay_ms"`
	DurationMs       int64                 `json:"duration_ms"`
}

// directionValue maps a node direction to the 0–1 dimension score space:
// high/internal/future → 1.0; low/external/past → 0.0.
func directionValue(direction string) (float64, bool) {
	switch direction {
	case "high", "internal", "future":
		return 1.0, true
	case "low", "external", "past":
		return 0.0, true
	default:
		return 0, false
	}
}

// wireOrderWeight returns the draw-order weight for the i-th wire (0-based).
func wireOrderWeight(i int) float64 {
	switch i {
	case 0:
		return mapFirstWireWeight
	case 1:
		return mapSecondWireWeight
	default:
		return mapThirdWireWeight
	}
}

// computePulseSignals derives dimension signals from Map (pulse) responses.
// These carry a ×0.75 confidence modifier (communicated to the Analyst via
// pulse_signals_today). Pulse responses do NOT increment dimension n — the
// Analyst prompt enforces this.
//
// Wire contribution rules: a dimension tagged on both endpoints with the same
// direction contributes at full weight; opposite directions contribute nothing
// (ambiguous, dropped); tagged on one endpoint only contributes at half weight.
// A wire to the center anchor carries only the outer node's tags at ×1.5.
// An isolated node contributes the opposite pole of its primary dimension at
// ×0.5. Per dimension the output is the weighted mean of contributions.
func computePulseSignals(responses []db.CardResponse) map[string]interface{} {
	type contribution struct {
		value  float64
		weight float64
	}
	dimContribs := make(map[string][]contribution)
	centerIsolated := false
	var firstWireDelayMs *int64
	var durationMs int64
	haveTiming := false

	addContrib := func(dim string, value, weight float64) {
		dimContribs[dim] = append(dimContribs[dim], contribution{value: value, weight: weight})
	}

	for _, r := range responses {
		if r.FragmentType != "pulse" {
			continue
		}
		var rd pulseMapResponseData
		if json.Unmarshal(r.ResponseData, &rd) != nil {
			continue
		}
		// Transition-day rows: old stimulus-shape response_data has no
		// connections key — skip silently (one day of pulse signal lost).
		if rd.Connections == nil {
			continue
		}
		scenarioID := rd.ScenarioID
		if scenarioID == "" {
			scenarioID = r.FragmentID
		}
		if _, ok := signal.LookupScenario(scenarioID); !ok {
			continue
		}

		for i, conn := range *rd.Connections {
			orderW := wireOrderWeight(i)

			// Center wire: only the outer node's tags, at ×1.5.
			if conn.A == "center" || conn.B == "center" {
				outerID := conn.A
				if outerID == "center" {
					outerID = conn.B
				}
				node, ok := signal.LookupScenarioNode(scenarioID, outerID)
				if !ok {
					continue
				}
				for dim, sig := range node.DimensionSignals {
					if v, ok := directionValue(sig.Direction); ok {
						addContrib(dim, v, orderW*mapCenterWeight)
					}
				}
				continue
			}

			nodeA, okA := signal.LookupScenarioNode(scenarioID, conn.A)
			nodeB, okB := signal.LookupScenarioNode(scenarioID, conn.B)
			if !okA || !okB {
				continue
			}
			dims := make(map[string]bool)
			for dim := range nodeA.DimensionSignals {
				dims[dim] = true
			}
			for dim := range nodeB.DimensionSignals {
				dims[dim] = true
			}
			for dim := range dims {
				sigA, inA := nodeA.DimensionSignals[dim]
				sigB, inB := nodeB.DimensionSignals[dim]
				switch {
				case inA && inB:
					vA, okVA := directionValue(sigA.Direction)
					vB, okVB := directionValue(sigB.Direction)
					if !okVA || !okVB || vA != vB {
						continue // opposite directions — ambiguous, dropped
					}
					addContrib(dim, vA, orderW)
				case inA:
					if v, ok := directionValue(sigA.Direction); ok {
						addContrib(dim, v, orderW*mapOneSidedWeight)
					}
				case inB:
					if v, ok := directionValue(sigB.Direction); ok {
						addContrib(dim, v, orderW*mapOneSidedWeight)
					}
				}
			}
		}

		for _, id := range rd.IsolatedNodes {
			if id == "center" {
				// The center has no dimension tags — surfaced to the Analyst
				// as a context flag, not a numeric signal.
				centerIsolated = true
				continue
			}
			node, ok := signal.LookupScenarioNode(scenarioID, id)
			if !ok || node.PrimaryDimension == "" {
				continue
			}
			sig, ok := node.DimensionSignals[node.PrimaryDimension]
			if !ok {
				continue
			}
			if v, ok := directionValue(sig.Direction); ok {
				// Opposite pole: the user avoided what the node probes.
				addContrib(node.PrimaryDimension, 1.0-v, mapIsolatedWeight)
			}
		}

		firstWireDelayMs = rd.FirstWireDelayMs
		durationMs = rd.DurationMs
		haveTiming = true
	}

	out := make(map[string]interface{})
	for dim, contribs := range dimContribs {
		var weightedSum, weightSum float64
		for _, c := range contribs {
			weightedSum += c.value * c.weight
			weightSum += c.weight
		}
		if weightSum == 0 {
			continue
		}
		out[dim] = map[string]interface{}{
			"signal":              round2(weightedSum / weightSum),
			"n_contributions":     len(contribs),
			"confidence_modifier": pulseConfidenceModifier,
		}
	}
	if centerIsolated {
		out["center_isolated"] = true
	}
	if haveTiming {
		deliberation := map[string]interface{}{"duration_ms": durationMs}
		if firstWireDelayMs != nil {
			deliberation["first_wire_delay_ms"] = *firstWireDelayMs
		}
		out["deliberation"] = deliberation
	}

	if len(out) == 0 {
		return nil
	}
	return out
}

// decayDimensions applies confidence decay for long breaks (Section 4d).
// Confidence decays only; scores are preserved unchanged.
// Idempotent: the same lastCompile + now pair always produces the same result.
// Zero lastCompile (new users with no prior compile) skips decay.
func decayDimensions(dims json.RawMessage, lastCompile time.Time, now time.Time) json.RawMessage {
	if len(dims) == 0 || lastCompile.IsZero() {
		return dims
	}
	daysSince := int(now.Sub(lastCompile).Hours() / 24)
	daysBeyondGrace := daysSince - confidenceDecayGraceDays
	if daysBeyondGrace <= 0 {
		return dims
	}

	multiplier := 1.0 - float64(daysBeyondGrace)*confidenceDecayRatePerDay
	if multiplier < confidenceDecayFloorMult {
		multiplier = confidenceDecayFloorMult
	}

	var dimMap map[string]map[string]json.RawMessage
	if err := json.Unmarshal(dims, &dimMap); err != nil {
		return dims
	}

	for key, entry := range dimMap {
		rawConf, ok := entry["confidence"]
		if !ok {
			continue
		}
		var conf float64
		if err := json.Unmarshal(rawConf, &conf); err != nil {
			continue
		}
		newConf := conf * multiplier
		if newConf < confidenceDecayFloorMin {
			newConf = confidenceDecayFloorMin
		}
		b, err := json.Marshal(round2(newConf))
		if err != nil {
			continue
		}
		entry["confidence"] = b
		dimMap[key] = entry
	}

	result, err := json.Marshal(dimMap)
	if err != nil {
		return dims
	}
	return result
}

// --- Numeric helpers ---

func floatMean(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals))
}

func floatStdDev(vals []float64) float64 {
	if len(vals) < 2 {
		return 0
	}
	m := floatMean(vals)
	variance := 0.0
	for _, v := range vals {
		d := v - m
		variance += d * d
	}
	return math.Sqrt(variance / float64(len(vals)-1))
}

func round2(f float64) float64 {
	return math.Round(f*100) / 100
}

func roundTo1(f float64) float64 {
	return math.Round(f*10) / 10
}
