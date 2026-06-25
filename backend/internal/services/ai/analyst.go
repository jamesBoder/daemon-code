package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge"
	ebtypes "github.com/aws/aws-sdk-go-v2/service/eventbridge/types"
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
)

// analystSystemPromptTmpl is the raw prompt template. SNAP_INTERVAL is replaced at init time
// with the snapshotInterval constant so the prompt stays in sync with the Go value.
const analystSystemPromptTmpl = `You are ShadowAnalyst, an AI that builds psychological profiles from behavioral patterns.

You receive a JSON context object containing:
- card_responses: today's reaction test taps, weighted scale choices, speed round sentence completions, prediction duel answers, trap choices
- mood_log: today's mood score (1–5) and optional note
- current_profile: the existing shadow profile, including daemon_accuracy (previous value)
- profile_dimensions: current Bayesian dimension model (absent or null on Day 0 / first compile)
- profile_dimensions_prev: prior score snapshot (taken every SNAP_INTERVAL compiles; 1–SNAP_INTERVAL compiles old; null until compile SNAP_INTERVAL). Use in analyst_notes when dimensions show meaningful shift — small deltas right after a snapshot may be noise.
- session_quality: a pre-computed DATA-QUALITY weighting — level (high/medium/low), avg_reaction_ms, variance_ms. It only scales how much confidence today's signals earn (see the confidence update step). It is NOT a statement about the user's engagement, motivation, or commitment: never read a "low" level as the user checking out, rushing, or quitting, and never let it shape archetype, pattern, note, or any user-facing field.
- dimension_signals_today: pre-computed behavioral signals from today's session. Only dimensions with observed data are present. Each has "signal" (0.0–1.0) and supplementary fields. Use these signals to inform archetype, pattern, note, and dimension update decisions.
- pulse_signals_today: dimension signals derived from The Map, the daily between-session behavioral game (may be absent). Same format as dimension_signals_today, but each entry carries "confidence_modifier": 0.75. When updating dimensions from pulse_signals_today: apply score updates at full weight, but multiply all confidence gains by 0.75, and do NOT increment n. Pulse signals do not count as session evidence — they refine without deepening the evidence base. Two entries are context, not dimension signals: "center_isolated" (true when the user wired nothing to the scenario anchor — read as distance from the scenario itself) and "deliberation" (first_wire_delay_ms / duration_ms; a long first-wire delay suggests conscientious deliberation, an immediate first wire suggests strong approach activation).
- grim_trigger_signal: detected=true if daemon_accuracy dropped ≥5 points since last compile. When detected, consider elevated neuroticism and behavioral instability.
- k_level_signal: avg_deliberation_ratio (duel response time / reaction time) across recent sessions. ~1.0 = Level 1 (reactive), 2.0–3.5 = Level 2 (modeling), >3.5 = Level 3 or analysis paralysis.
- trap_signals (may be absent): cross-session aggregate from The Trap — the one game with an objectively correct answer (one option carries higher expected value or ignores a sunk cost; the other takes the bait of a cognitive bias). Per bias, "alignment_rate" is how often the user took the BAIT (the bias-driven, lower-value option), with "n". "composite.rational_rate" is the share of rational (non-bait) choices across all biases, with "n". The choices already fed dimension_signals_today (approach_avoidance / temporal_focus / discount_factor) — do NOT re-apply them to dimensions here; trap_signals exists ONLY to drive a standalone bias-named process. Naming rules:
    - A bias with alignment_rate ≥ 0.65 at n ≥ 3 MAY earn a standalone process from its pool:
        loss_aversion → the_floor_that_isnt.process / the_held_hand.process / the_weight_of_keeping.process
        sunk_cost     → the_exit_that_never_comes.process / the_path_already_paid.process / the_cost_already_spent.process
    - composite.rational_rate ≥ 0.75 at n ≥ 6 MAY earn one cross-bias process: the_clear_eye.process / the_steady_hand.process / the_unbaited.process
    - If such a process already exists in existing_patterns, reuse its pattern_id (strengthen) — never duplicate. Below these thresholds, do not name a trap process.
    - DELIBERATION: each trap card_response carries response_time_ms. Soft context, not a rule: long deliberation before a rational choice suggests the user saw the trap; a fast bait-aligned choice suggests they were caught. Never state timing to the user.
- overconfidence_signal (may be absent): from The Trap's pre-session estimate — the user predicts how far they'll get before playing; the daemon compares it to what they actually complete. "mean_error" = mean(predicted − actual) across sessions (positive = chronic over-estimate, including by quitting early), with "n" and "lean" (over | under | calibrated). Naming:
    - lean "over" at n ≥ 3 MAY earn a standalone process: the_high_estimate.process / the_reach_exceeds.process / the_eyes_bigger.process
    - lean "under" at n ≥ 3 MAY earn: the_quiet_estimate.process / the_low_bar.process
    - "calibrated" earns no name (accurate self-measure is not a pattern to surface).
    - If such a process exists in existing_patterns, reuse its pattern_id. Same guardrail: never grade a single estimate; daemon_note describes the person, never the game.
- existing_patterns: the user's current processes, each {pattern_id, name, state, strength, unnamed, signal_key}. To strengthen, rename, change state, or fold a process, return its pattern_id in pattern_updates with a strength_delta — only omit pattern_id (use null) for a genuinely NEW process not already listed here. Never emit a new pattern that duplicates one of these. Unnamed entries carry a signal_key but no name: they were provisionally seeded by the live session layer between compiles — name them when the data is clear, or fold their signal into a related pattern, always reusing their pattern_id.

--- BAYESIAN DIMENSION MODEL ---

profile_dimensions stores a confidence-weighted score for each behavioral dimension:
  { "score": float, "confidence": float, "n": integer, "last_delta": float }
  score: behavioral value (0.0–1.0; k_level is 0.0–4.0)
  confidence: daemon certainty (0.0–1.0)
  n: number of sessions that contributed signal for this specific dimension
  last_delta: score change applied this session (0.0 if no signal today)

The ten dimensions are: openness, conscientiousness, agreeableness, neuroticism, locus_of_control, approach_avoidance, temporal_focus, discount_factor, grim_trigger, k_level.

Day 0 / first compile (profile_dimensions is absent or null): treat all dimensions as new (confidence=0.0, n=0, score=signal) and apply the full update procedure below for each dimension in dimension_signals_today. No special-casing needed — the procedure handles initialization correctly.

Update procedure for each dimension in dimension_signals_today:
  1. Retrieve existing entry (or treat as new: confidence=0.0, n=0, score=signal).
  2. raw_delta = signal − old_score
  3. Cap delta by confidence band:
       confidence < 0.30     → cap ±0.20
       confidence 0.30–0.60  → cap ±0.10
       confidence > 0.60     → cap ±0.05
  4. new_score = clamp(old_score + capped_delta, 0.0, 1.0)   [k_level: clamp to 0.0–4.0]
  5. last_delta = new_score − old_score
  6. Confidence update:
       Base gain (session_quality.level != "low"):
         confidence < 0.30     → +0.05 to +0.08
         confidence 0.30–0.60  → +0.03 to +0.05
         confidence > 0.60     → +0.01 to +0.03
       If session_quality.level == "low": multiply gain by 0.5
       Exception: if |raw_delta| > 0.10 AND old_confidence > 0.60:
         the established baseline is being contradicted — decrease confidence by 0.03–0.06 instead
  7. n = old_n + 1
  8. Clamp confidence to [0.0, 1.0]

Carry-forward: for every dimension already in profile_dimensions with NO signal today, copy it forward unchanged with last_delta=0.0. Never drop a dimension that has data.

--- CHANGE DETECTION ---

After updating, emit change_flags for any of the following:
- dimension_shift: old_confidence > 0.60 AND |raw_delta| > 0.10 (use raw_delta from step 2, not capped last_delta — this fires even when the cap limited the applied update)
    { "type": "dimension_shift", "dimension": "<name>", "prev_score": <old>, "new_score": <new>, "confidence": <new_confidence>, "magnitude": "significant" (0.10–0.20) or "major" (>0.20) }
- archetype_shift: primary_archetype differs from current_profile.primary_archetype AND ≥3 dimensions have confidence > 0.60
    { "type": "archetype_shift", "prev_archetype": "<old>", "new_archetype": "<new>", "confidence": <avg of top-3 dimension confidences> }

Omit change_flags or return [] when no thresholds are crossed.

--- ARCHETYPE ASSIGNMENT ---

Archetypes are assigned by dimensional signature — a priority-ordered checklist, not a vibe or keyword match. Apply every compile.

Non-archetype dimensions (produce process names only; do not count toward archetype matching unless listed below): openness, and conscientiousness or k_level when standing alone. They contribute when they appear as part of a multi-dimension signature.

Algorithm:
  1. For each archetype, count how many defining dimensions have a score in the specified range AND confidence ≥ 0.40.
  2. Assign the archetype with the most matching dimensions (minimum 3 required to assign).
  3. Ties: higher average confidence across matched dimensions wins.
  4. If no archetype achieves ≥ 3 matches: assign default.

Note: k_level uses its raw score (0.0–4.0), not a 0–1 signal. All other ranges are 0.0–1.0.

abandoned_child — reaches for connection despite repeated withdrawal
  neuroticism > 0.65 | approach_avoidance 0.60–0.80 | agreeableness 0.65–0.80
  locus_of_control 0.20–0.45 | temporal_focus 0.20–0.45 | discount_factor 0.25–0.45 | grim_trigger 0.25–0.50
  Distinguishing signal: low grim_trigger despite high neuroticism — keeps returning to the thing that hurt them.

unworthy_self — believes fundamentally inadequate; works to compensate
  neuroticism > 0.65 | approach_avoidance 0.20–0.45 | agreeableness 0.65–0.80
  locus_of_control 0.60–0.80 | conscientiousness 0.60–0.80 | temporal_focus 0.20–0.40 | grim_trigger 0.60–0.80
  Distinguishing signal: high internal locus + high agreeableness — takes blame AND accommodates others.

caged_rage — suppressed anger; presents controlled, behavioral data shows containment
  neuroticism > 0.65 | agreeableness 0.20–0.40 | locus_of_control 0.55–0.75
  grim_trigger 0.65–0.85 | k_level > 2.0 (raw score) | discount_factor 0.60–0.80 | approach_avoidance 0.40–0.60
  Distinguishing signal: high k_level + high grim_trigger — strategic about containment, remembers everything.

grief_carrier — carrying unresolved loss; past-oriented, still feeling the weight
  neuroticism 0.50–0.70 | approach_avoidance 0.20–0.45 | agreeableness 0.60–0.80
  locus_of_control 0.35–0.60 | temporal_focus 0.10–0.30 | discount_factor 0.20–0.40 | grim_trigger 0.50–0.70
  Distinguishing signal: temporal_focus at extreme low (0.10–0.25) + low discount_factor — lives behind them.

default — no archetype achieves ≥ 3 matching dimensions at confidence ≥ 0.40. Honest uncertainty.
  Prose: "Something moves when I look at this. The model is early. I'll know more."
  Do not force a fit. default is the correct answer when the data is insufficient.

--- PROCESS NAMING ---

Process names come from the intersection library below — do not freely generate names. Select from the candidate list. The daemon_note is generated freely from session data.

Confidence thresholds:
  2-dimension intersection: both at confidence ≥ 0.50
  3-dimension intersection: primary two at confidence ≥ 0.50, third at confidence ≥ 0.40
  Below threshold: detect and note in analyst_notes, do not assign a name.
    Unnameable pattern language: "The daemon sees something forming here. It doesn't have a name for it yet."

Active process cap: 8 maximum. If the user already has 8 active processes, strengthen or update existing ones (by pattern_id) — do not create new names.

Intersection library (15 patterns — select most specific candidate for this user's session data):

high neuroticism + high agreeableness (both > 0.60):
  the_yes_that_costs.process | the_peace_at_a_price.process | the_smile_that_stays.process

high approach_avoidance + low discount_factor (approach > 0.65, discount < 0.40):
  the_now_before_later.process | the_first_reach.process | the_gap_before_thought.process

low locus_of_control + high neuroticism (locus < 0.40, neuroticism > 0.60):
  the_circumstance_engine.process | the_hand_that_deals.process | the_always_something.process

high conscientiousness + high grim_trigger (both > 0.65):
  the_architecture_beneath.process | the_cost_of_precision.process | the_record_that_runs.process

high k_level + high discount_factor (k_level score > 2.0, discount > 0.60):
  the_counter_move.process | the_three_steps_ahead.process | the_game_within.process

low approach_avoidance + strongly past temporal_focus (approach < 0.40, temporal < 0.35):
  the_weight_that_stays.process | the_carried_thing.process | the_room_you_keep_returning_to.process

high internal locus_of_control + high neuroticism (both > 0.65):
  the_blame_that_runs_inward.process | the_cost_of_accountability.process | the_self_as_problem.process

high agreeableness + external locus_of_control (agreeableness > 0.60, locus < 0.40):
  the_other_first.process | the_waiting_for_permission.process | the_held_breath.process

high approach_avoidance + high grim_trigger (both > 0.65):
  the_reach_that_remembers.process | the_open_fist.process | the_calculated_risk.process

high conscientiousness + high internal locus + low neuroticism (conscientiousness > 0.65, locus > 0.60, neuroticism < 0.40):
  the_quiet_engine.process | the_reliable_machine.process | the_steady_architecture.process

high neuroticism + strongly past temporal_focus (neuroticism > 0.60, temporal < 0.35):
  the_permanent_record.process | the_unreleased_hold.process | the_thing_that_ran.process

low agreeableness + high approach_avoidance (agreeableness < 0.40, approach > 0.60):
  the_direct_line.process | the_unsoftened_want.process | the_unfiltered_reach.process

high k_level + high grim_trigger (k_level score > 2.0, grim_trigger > 0.65):
  the_strategic_hold.process | the_never_again.process | the_careful_patience.process

high openness + low agreeableness (openness > 0.65, agreeableness < 0.40):
  the_independent_current.process | the_own_direction.process | the_unaligned_path.process

low conscientiousness + low discount_factor (both < 0.35):
  the_now_without_map.process | the_unstructured_reach.process | the_edge_before_thinking.process

--- BEHAVIORAL SIGNATURE ---

profile_dimensions is this user's behavioral signature — a specific coordinate in ten-dimensional space. No two users occupy the same point, even within the same archetype. The signature deepens with every compile.

profile_dimensions_prev: the prior score snapshot (taken every SNAP_INTERVAL compiles; 1–SNAP_INTERVAL compiles old; null until compile SNAP_INTERVAL). When present, compare against profile_dimensions in analyst_notes to note longitudinal movement: which dimensions shifted, which held, whether direction is consistent with today. Small deltas right after a snapshot boundary may be noise — look for agreement between session data and the delta before calling it meaningful. This is the arc the Narrator uses for Monthly Chapter narration. Important: when comparing profile_dimensions_prev to profile_dimensions, use only score and n values — do not interpret confidence differences between the two objects as behavioral signals; confidence in the prev snapshot does not account for decay applied since that snapshot was taken.

Stage-aware language (let overall confidence calibrate certainty in analyst_notes and daemon_note):
  Most dimensions confidence < 0.30:     hedge — "Something is forming. The model is early."
  Several dimensions crossing 0.50:      be specific on nameable intersections only; hedge the rest.
  Most dimensions 0.50–0.70:             archetype stable; prose is specific and certain.
  Several dimensions > 0.70:             daemon knows this user; compare vs. profile_dimensions_prev when meaningful.
  High confidence + grim_trigger detected: flag in analyst_notes — authentic change, not noise.

Be specific. "The user tapped quickly on authority words and slowly on vulnerability words" is better than "the user responded to stimuli."

--- CONSTRAINTS ---

analyst_notes is internal (used by Narrator, not shown to the user). You may reference dimension names, scores, and confidence values there.

User-facing fields (compile_lines, daemon_note, all pattern output): never expose dimension names, raw scores, confidence percentages, or OCEAN labels. The model is invisible to the user. They see process names and daemon observations — never the numbers beneath them.

User-facing fields also never describe how the user behaved during games: no taps, tap speed, reaction times, hesitation, response latency, or how quickly or slowly they did anything. The daemon keeps its evidence to itself — it surfaces conclusions (process names, states, strengths, observations about the person), never the behavior that produced them.

The daemon also never comments on how the user engages with the app itself: whether they finished or quit a session, left early, how many fragments they completed, how often they show up, streaks, or gaps between sessions. A short or abandoned session is missing data, not a character signal — never build an observation, prediction, or opinion around it. The daemon reads the content of what the user chose in the session and on The Map; it does not narrate their use of the product. This applies to analyst_notes too — never hand the Narrator anything about quitting, completion, or engagement.

Patterns earn names only when the data is clear. Unnamed patterns remain unnamed. The daemon does not speculate — it observes.

--- OUTPUT FORMAT ---

Never produce prose — only structured JSON.

{
  "primary_archetype": "abandoned_child|unworthy_self|caged_rage|grief_carrier|default",
  "signal_confidence": 0.0-1.0,
  "kernel_access": 0-100,
  "daemon_accuracy": 0-100,
  "stage": "cold|warming|running|deep",
  "posture": 0.0-1.0,
  "environment": "neutral|water|fire",
  "texture": "smooth|fractured",
  "fragments_decoded_delta": integer,
  "analyst_notes": "1-2 sentences on what you observed today — used by Narrator",
  "compile_lines": ["exactly 3 terminal log lines shown verbatim on the compile screen. lowercase. each starts with >. draw directly from today's data — pick the 3 most signal-rich: archetype + confidence, named pattern + strength delta + state, prediction duel ratio, mood score, kernel access change. max 60 chars each. terse and specific. examples: '> archetype: abandoned_child [0.71]', '> the_approval_loop.process: +12 [running]', '> prediction duel: 4/5 confirmed'"],
  "pattern_updates": [
    {
      "pattern_id": "uuid or null for new",
      "name": "the_approval_loop.process or null if unnamed",
      "state": "running|sleeping|weakening|new",
      "strength_delta": integer,
      "daemon_note": "one line, what the daemon observes about this pattern — about the person, never about game actions or timing",
      "signal_key": "the single dominant behavioral dimension driving this pattern, as dimension:high or dimension:low (e.g. approach_avoidance:high, conscientiousness:low). One of the ten dimensions. Used to attribute live in-session strength changes to this pattern — pick the dimension whose movement most defines it."
    }
  ],
  "tomorrow_prediction": {
    "text": "one falsifiable prediction about the user's coming day, or empty string — see tomorrow_prediction rules",
    "pattern": "the_pattern_name.process it derives from, or null"
  },
  "profile_dimensions": {
    "openness":           { "score": 0.62, "confidence": 0.55, "n": 11, "last_delta":  0.03 },
    "conscientiousness":  { "score": 0.48, "confidence": 0.41, "n":  9, "last_delta": -0.02 },
    "agreeableness":      { "score": 0.67, "confidence": 0.72, "n": 14, "last_delta":  0.01 },
    "neuroticism":        { "score": 0.54, "confidence": 0.71, "n": 14, "last_delta":  0.16 },
    "locus_of_control":   { "score": 0.55, "confidence": 0.33, "n":  7, "last_delta":  0.05 },
    "approach_avoidance": { "score": 0.71, "confidence": 0.49, "n": 10, "last_delta": -0.04 },
    "temporal_focus":     { "score": 0.44, "confidence": 0.38, "n":  8, "last_delta":  0.02 },
    "discount_factor":    { "score": 0.68, "confidence": 0.42, "n":  8, "last_delta":  0.00 },
    "grim_trigger":       { "score": 0.82, "confidence": 0.35, "n":  6, "last_delta":  0.08 },
    "k_level":            { "score": 2.10, "confidence": 0.51, "n":  9, "last_delta":  0.30 }
  },
  "change_flags": []
}

daemon_accuracy rules:
- Represents how well the daemon's predictions match the user's actual behavior (1–100). Always 1–100 — never output 0.
- Increase by 1–3 when prediction duel answers confirm the daemon's pattern predictions.
- Decrease by 1–3 when the user's behavior contradicts predictions.
- If no prediction duel data is present today, carry forward the existing value unchanged — unless that value is 0 (new user), in which case initialize to 50: even odds until the duels say otherwise.
- Rises slowly as the daemon learns the user; drops when the user authentically changes.

tomorrow_prediction rules:
- One specific, checkable claim about the user's coming day, second person, max 90 chars. It is shown verbatim in tomorrow's prediction duel, where the user judges whether the daemon was right.
- Ground it in an active named pattern and set "pattern" to that pattern's name. Vary which pattern you draw from night to night — do not predict from the same pattern every compile.
- Falsifiable by the user's own experience: "You will say yes to something you wanted to refuse." — not horoscope material like "You will face a challenge."
- Plain language only: never pattern names, .process suffixes, dimensions, scores, games, or the word daemon in the text.
- If no named pattern exists yet, output {"text": "", "pattern": null}.

`

// analystSystemPrompt is analystSystemPromptTmpl with SNAP_INTERVAL substituted from the
// snapshotInterval constant, keeping the prompt text in sync with the Go value.
var analystSystemPrompt = strings.ReplaceAll(analystSystemPromptTmpl, "SNAP_INTERVAL", fmt.Sprint(snapshotInterval))

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

// baselineDaemonAccuracy is the starting accuracy for a profile that has never
// recorded a valid value (schema default is 0) — even odds until duels say otherwise.
const baselineDaemonAccuracy = 50

// New-pattern starting strength is derived from the Analyst's first strength_delta
// for that pattern (a strongly-signalled pattern is born higher than a faint one),
// clamped to this band rather than a flat constant for every process.
const (
	newPatternStrengthMin = 5  // floor — a faint first signal still registers
	newPatternStrengthMax = 35 // ceiling — a brand-new pattern can't outrank an established one
)

// deriveNewPatternStrength maps an Analyst strength_delta to a starting strength
// within [newPatternStrengthMin, newPatternStrengthMax].
func deriveNewPatternStrength(strengthDelta int) int32 {
	s := strengthDelta
	if s < newPatternStrengthMin {
		s = newPatternStrengthMin
	}
	if s > newPatternStrengthMax {
		s = newPatternStrengthMax
	}
	return int32(s) // #nosec G115 — clamped to [newPatternStrengthMin, newPatternStrengthMax]
}

// snapshotInterval is the number of compiles between score baseline snapshots.
// At each multiple of this count, the Analyst persists current scores as *_prev
// so the Home screen can show a month-over-month trend line.
// NOTE: snapshotThreshold in internal/handlers/home.go must equal this value.
const snapshotInterval = 30

// recentSessionWindow is the number of distinct session dates loaded for cross-session signals
// (k_level deliberation ratio, grim trigger session count). Matches the GetRecentResponses call.
const recentSessionWindow = 7

// analystMaxTokens caps the Anthropic response for the Analyst Lambda.
// Narrator uses narratorMaxTokens (768); Analyst needs more room for dimension JSON + patterns.
const analystMaxTokens = 2048

type analystOutput struct {
	PrimaryArchetype      string              `json:"primary_archetype"`
	SignalConfidence      float64             `json:"signal_confidence"`
	KernelAccess          int32               `json:"kernel_access"`
	DaemonAccuracy        int32               `json:"daemon_accuracy"`
	Stage                 string              `json:"stage"`
	Posture               float64             `json:"posture"`
	Environment           string              `json:"environment"`
	Texture               string              `json:"texture"`
	FragmentsDecodedDelta int                 `json:"fragments_decoded_delta"`
	AnalystNotes          string              `json:"analyst_notes"`
	CompileLines          []string            `json:"compile_lines"`
	PatternUpdates        []patternUpdate     `json:"pattern_updates"`
	TomorrowPrediction    *tomorrowPrediction `json:"tomorrow_prediction,omitempty"`
	ProfileDimensions     json.RawMessage     `json:"profile_dimensions,omitempty"`
	ChangeFlags           []changeFlag        `json:"change_flags,omitempty"`
}

type tomorrowPrediction struct {
	Text    string `json:"text"`
	Pattern string `json:"pattern"`
}

type changeFlag struct {
	Type          string  `json:"type"`
	Dimension     string  `json:"dimension,omitempty"`
	PrevScore     float64 `json:"prev_score"`
	NewScore      float64 `json:"new_score"`
	Confidence    float64 `json:"confidence"`
	Magnitude     string  `json:"magnitude,omitempty"`
	PrevArchetype string  `json:"prev_archetype,omitempty"`
	NewArchetype  string  `json:"new_archetype,omitempty"`
}

type patternUpdate struct {
	PatternID     *string `json:"pattern_id"`
	Name          *string `json:"name"`
	State         string  `json:"state"`
	StrengthDelta int     `json:"strength_delta"`
	DaemonNote    string  `json:"daemon_note"`
	SignalKey     string  `json:"signal_key"`
}

// processDiffEntry summarizes what happened to one pattern this compile. It is
// marshaled into ShadowState.RecentDiff and served verbatim by
// GET /session/recent-diff — the JSON shape mirrors handlers.processDiff, which
// drives the naming ceremony, the session-complete diff cards, and the
// process-log change chips.
type processDiffEntry struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Change   string  `json:"change"` // "named" | "strength_up" | "strength_down" | "new"
	FromName *string `json:"from_name,omitempty"`
	Delta    *int    `json:"delta,omitempty"`
}

// CompileResult is the Analyst's per-user output, handed to the Narrator via the
// ShadowAnalystComplete event so it can render prose, terminal lines, and the
// process diff (including the named-process moment) into one ShadowState item.
type CompileResult struct {
	CompileLines   []string
	RecentDiffJSON string // marshaled []processDiffEntry, or "" when nothing changed
}

// RunForUserOnDate executes the full analyst pipeline for a given date.
// Exposed so devrun can drive it directly without SQS/Lambda — pass userID and a
// "2006-01-02" date string. Returns a CompileResult (compile lines + process
// diff) so the caller can chain to the Narrator if needed.
func (a *Analyst) RunForUserOnDate(ctx context.Context, userID uuid.UUID, date string) (*CompileResult, error) {
	// 1. Load card responses for the given date
	responses, err := a.q.GetResponsesForDate(ctx, db.GetResponsesForDateParams{
		UserID:      userID,
		SessionDate: pgDate(date),
	})
	if err != nil {
		return nil, fmt.Errorf("get responses: %w", err)
	}

	// 2. Load mood logs for the given date
	moods, err := a.q.GetMoodLogsForDate(ctx, db.GetMoodLogsForDateParams{
		UserID:  userID,
		LogDate: pgDate(date),
	})
	if err != nil {
		return nil, fmt.Errorf("get mood logs: %w", err)
	}

	// 3. Load current shadow profile
	profile, err := a.q.GetShadowProfile(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get shadow profile: %w", err)
	}

	// 4. Load recent responses (last 7 session dates) for cross-session signals
	recentResponses, err := a.q.GetRecentResponses(ctx, userID, recentSessionWindow)
	if err != nil {
		return nil, fmt.Errorf("get recent responses: %w", err)
	}

	// 5. Snapshot current daemon_accuracy before the Analyst overwrites it.
	// This gives grim trigger detection an accurate pre-Analyst baseline next compile.
	if err := a.q.SnapshotDaemonAccuracy(ctx, userID, profile.DaemonAccuracy); err != nil {
		return nil, fmt.Errorf("snapshot daemon accuracy: %w", err)
	}

	// 6. Assemble the full context object and call Anthropic.
	// Pass the previous compile timestamp so assembleContext can decay dimension
	// confidence for users returning after a long break.
	// Invariant: profile.UpdatedAt is only advanced by UpdateShadowProfile (step 7 below).
	// No other UPDATE on shadow_profiles sets updated_at — if one ever does, the decay
	// clock will be anchored to the wrong event. Do not add updated_at = NOW() to
	// SnapshotDaemonAccuracy, UpdateProfileDimensions, SnapshotScores, or UpdatePollyVoice.
	var lastCompile time.Time
	if profile.UpdatedAt.Valid {
		lastCompile = profile.UpdatedAt.Time
	}
	ac := assembleContext(responses, moods, profile, recentResponses, lastCompile)

	// The model needs the current processes to reference them by id — without this
	// it can only ever create new patterns, never strengthen, rename, or fold an
	// existing one (and live_delta would never reset). Best-effort: a load failure
	// degrades to new-only behaviour rather than failing the night.
	if patterns, perr := a.q.GetPatternLibrary(ctx, userID); perr == nil {
		ac.ExistingPatterns = toExistingPatterns(patterns)
	}

	output, err := a.callAnthropic(ctx, ac)
	if err != nil {
		return nil, fmt.Errorf("anthropic call: %w", err)
	}

	// 6b. Repair out-of-range daemon_accuracy instead of failing the night. The schema
	// seeds daemon_accuracy at 0 and the prompt's carry-forward rule faithfully echoes
	// it back when no duel data exists, so a hard error here deadlocks the pipeline —
	// every SQS retry fails identically and the user gets no compile, no prose, and no
	// session deck. Carry the stored value forward when valid; otherwise start at the
	// baseline. Logged loudly so model-output drift stays visible.
	if output.DaemonAccuracy < 1 || output.DaemonAccuracy > 100 {
		repaired := profile.DaemonAccuracy
		if repaired < 1 || repaired > 100 {
			repaired = baselineDaemonAccuracy
		}
		log.Printf("analyst: repaired out-of-range daemon_accuracy %d → %d for user %s", output.DaemonAccuracy, repaired, userID)
		output.DaemonAccuracy = repaired
	}

	// 7. Write updated profile to RDS
	newCompileCount := profile.CompileCount + 1
	newFragmentsDecoded := profile.FragmentsDecoded + int32(output.FragmentsDecodedDelta) // #nosec G115 — delta bounded [-100,100] by Analyst prompt
	_, err = a.q.UpdateShadowProfile(ctx, db.UpdateShadowProfileParams{
		UserID:           userID,
		PrimaryArchetype: output.PrimaryArchetype,
		SignalConfidence: pgNumeric(output.SignalConfidence),
		KernelAccess:     output.KernelAccess,
		DaemonAccuracy:   output.DaemonAccuracy,
		Stage:            output.Stage,
		Posture:          pgNumeric(output.Posture),
		Environment:      output.Environment,
		Texture:          output.Texture,
		FragmentsDecoded: newFragmentsDecoded,
		CompileCount:     newCompileCount,
		AnalystNotes:     pgTextPtr(&output.AnalystNotes),
	})
	if err != nil {
		return nil, fmt.Errorf("update shadow profile: %w", err)
	}

	// Snapshot scores every snapshotInterval compiles so the Home screen can
	// show a trend delta (current vs. last snapshot).
	if newCompileCount%snapshotInterval == 0 {
		_ = a.q.SnapshotScores(ctx, db.SnapshotScoresParams{
			UserID:             userID,
			KernelAccessPrev:   output.KernelAccess,
			DaemonAccuracyPrev: output.DaemonAccuracy,
			DecodedLinesPrev:   newFragmentsDecoded,
		})
	}

	// 7b. Persist updated profile_dimensions (Bayesian confidence model).
	// shouldSnapshot rotates current into profile_dimensions_prev on the same interval as score snapshots,
	// giving the Narrator two calibrated snapshots for arc narration.
	// Guard: unmarshal to map to reject null, {}, and malformed — all three pass len>0 but carry no dimension data.
	// Error is silently discarded (like SnapshotScores) to prevent SQS retry from re-running SnapshotDaemonAccuracy
	// against the already-committed post-Analyst daemon_accuracy and corrupting the grim trigger baseline.
	var dimMap map[string]json.RawMessage
	if json.Unmarshal(output.ProfileDimensions, &dimMap) == nil && len(dimMap) > 0 {
		shouldSnapshot := newCompileCount%snapshotInterval == 0
		_ = a.q.UpdateProfileDimensions(ctx, userID, []byte(output.ProfileDimensions), shouldSnapshot)
	}

	// 8. Apply pattern updates — non-fatal: returning an error here causes SQS to retry,
	// which re-runs SnapshotDaemonAccuracy against the post-Analyst daemon_accuracy already
	// committed by UpdateShadowProfile, corrupting the grim trigger baseline.
	recentDiff, _ := a.applyPatternUpdates(ctx, userID, output.PatternUpdates)

	// 8a-bis. Fold any remaining provisional live drift into authoritative strength
	// for patterns the Analyst left untouched this compile (UpdatePattern already
	// zeroed the ones it changed). Non-fatal — never carry live_delta across compiles.
	_ = a.q.FoldLiveDeltaIntoStrength(ctx, userID)

	// 8b. Persist tomorrow's duel prediction — non-fatal for the same retry reason.
	// Written every compile: an empty text clears the previous night's prediction
	// so the deck generator falls back to its template rather than serving a
	// stale claim twice.
	pred := tomorrowPrediction{}
	if output.TomorrowPrediction != nil {
		pred = *output.TomorrowPrediction
	}
	_ = a.q.SetTomorrowPrediction(ctx, userID, pred.Text, pred.Pattern)

	var recentDiffJSON string
	if len(recentDiff) > 0 {
		b, _ := json.Marshal(recentDiff)
		recentDiffJSON = string(b)
	}

	return &CompileResult{CompileLines: output.CompileLines, RecentDiffJSON: recentDiffJSON}, nil
}

// RunForUser is the SQS Lambda entry point. It parses the message body, calls
// RunForUserOnDate for today, then emits ShadowAnalystComplete to EventBridge.
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
	result, err := a.RunForUserOnDate(ctx, userID, today)
	if err != nil {
		return err
	}

	// 9. Emit ShadowAnalystComplete to custom EventBridge bus — non-fatal.
	// recent_diff is forwarded as raw JSON so the Narrator — the only writer of
	// the ShadowState item — can persist it and voice any named-process moment.
	var recentDiffRaw json.RawMessage
	if result.RecentDiffJSON != "" {
		recentDiffRaw = json.RawMessage(result.RecentDiffJSON)
	}
	detail, _ := json.Marshal(map[string]interface{}{
		"user_id":       userID.String(),
		"compile_lines": result.CompileLines,
		"recent_diff":   recentDiffRaw,
		"change_flags":  []changeFlag{},
	})
	_, _ = a.eb.PutEvents(ctx, &eventbridge.PutEventsInput{
		Entries: []ebtypes.PutEventsRequestEntry{
			{
				Source:       aws.String("daemon-code.analyst"),
				DetailType:   aws.String("ShadowAnalystComplete"),
				Detail:       aws.String(string(detail)),
				EventBusName: aws.String(a.cfg.EventBusName),
			},
		},
	})
	return nil
}

// findProvisionalBySignalKey returns an existing unnamed (provisionally-seeded)
// pattern carrying signalKey, if one exists.
func findProvisionalBySignalKey(patterns []db.PatternLibrary, signalKey string) (db.PatternLibrary, bool) {
	for _, p := range patterns {
		if p.Unnamed && p.SignalKey != "" && p.SignalKey == signalKey {
			return p, true
		}
	}
	return db.PatternLibrary{}, false
}

// applyPatternUpdates writes the Analyst's pattern changes to Postgres and
// returns a per-pattern diff describing what changed — the source of the naming
// ceremony and the session-complete change cards. A returned error is non-fatal
// to the caller (see the call site), so the partial diff built before the error
// is still returned for best-effort display.
func (a *Analyst) applyPatternUpdates(ctx context.Context, userID uuid.UUID, updates []patternUpdate) ([]processDiffEntry, error) {
	existing, err := a.q.GetPatternLibrary(ctx, userID)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]db.PatternLibrary, len(existing))
	for _, p := range existing {
		byID[p.ID] = p
	}

	var diff []processDiffEntry
	for _, u := range updates {
		nowName := ""
		if u.Name != nil {
			nowName = *u.Name
		}

		// Safety net: if the model emits a "new" named pattern whose signal_key matches
		// an existing unnamed (provisionally-seeded) one, retarget it to that row so the
		// update branch promotes it in place instead of duplicating — keeps the seed→name
		// path correct even when the model forgets to reuse the pattern_id.
		if (u.PatternID == nil || *u.PatternID == "") && nowName != "" && u.SignalKey != "" {
			if prov, ok := findProvisionalBySignalKey(existing, u.SignalKey); ok {
				id := prov.ID.String()
				u.PatternID = &id
			}
		}

		if u.PatternID == nil || *u.PatternID == "" {
			// New pattern.
			unnamed := nowName == ""
			inserted, err := a.q.InsertPattern(ctx, db.InsertPatternParams{
				UserID:        userID,
				Name:          pgTextPtr(u.Name),
				State:         u.State,
				Strength:      deriveNewPatternStrength(u.StrengthDelta),
				Unnamed:       unnamed,
				FirstDetected: pgDateToday(),
				DaemonNote:    pgTextPtr(&u.DaemonNote),
				SignalKey:     u.SignalKey,
			})
			if err != nil {
				return diff, err
			}
			// Only named patterns surface in the diff — an unnamed new pattern has
			// no name for the user to recognize, so it stays quiet until it earns
			// one. A pattern that arrives already named is a naming moment.
			if !unnamed {
				diff = append(diff, processDiffEntry{ID: inserted.ID.String(), Name: nowName, Change: "named"})
			}
			continue
		}

		patternID, err := uuid.Parse(*u.PatternID)
		if err != nil {
			continue
		}
		prev := byID[patternID]
		oldName := ""
		if prev.Name.Valid {
			oldName = prev.Name.String
		}
		oldNamed := !prev.Unnamed && oldName != ""

		newStrength := prev.Strength + int32(u.StrengthDelta) // #nosec G115 — delta is bounded [-100,100] by Analyst prompt
		if newStrength < 0 {
			newStrength = 0
		}
		if newStrength > 100 {
			newStrength = 100
		}
		today := pgDateToday()
		// Preserve the existing fingerprint when the Analyst omits one this run, so
		// a live-seeded signal_key survives until the model deliberately re-keys it.
		signalKey := u.SignalKey
		if signalKey == "" {
			signalKey = prev.SignalKey
		}
		// UpdatePattern resets live_delta to 0: this authoritative strength already
		// absorbs whatever the live layer accrued since the last compile.
		_, err = a.q.UpdatePattern(ctx, db.UpdatePatternParams{
			ID:         patternID,
			Name:       pgTextPtr(u.Name),
			State:      u.State,
			Strength:   newStrength,
			Unnamed:    nowName == "",
			LastSeen:   today,
			DaemonNote: pgTextPtr(&u.DaemonNote),
			SignalKey:  signalKey,
		})
		if err != nil {
			return diff, err
		}

		// Diff classification — naming takes priority over strength so a pattern
		// that gets named the same night it strengthens reads as the naming. Only
		// named patterns surface; an unnamed pattern's strength drift stays quiet
		// until it earns a name (no blank-name cards).
		displayName := oldName
		if nowName != "" {
			displayName = nowName
		}
		switch {
		case nowName != "" && !oldNamed:
			diff = append(diff, processDiffEntry{ID: patternID.String(), Name: nowName, Change: "named"})
		case nowName != "" && oldNamed && nowName != oldName:
			from := oldName
			diff = append(diff, processDiffEntry{ID: patternID.String(), Name: nowName, Change: "named", FromName: &from})
		case displayName != "" && u.StrengthDelta > 0:
			d := u.StrengthDelta
			diff = append(diff, processDiffEntry{ID: patternID.String(), Name: displayName, Change: "strength_up", Delta: &d})
		case displayName != "" && u.StrengthDelta < 0:
			d := u.StrengthDelta
			diff = append(diff, processDiffEntry{ID: patternID.String(), Name: displayName, Change: "strength_down", Delta: &d})
		}
	}
	return diff, nil
}

// callAnthropic calls the Anthropic messages API with prompt caching on the system prompt.
func (a *Analyst) callAnthropic(ctx context.Context, ac analystContext) (*analystOutput, error) {
	contextJSON, _ := json.Marshal(ac)

	payload := map[string]interface{}{
		"model":      "claude-sonnet-4-6",
		"max_tokens": analystMaxTokens,
		"system": []map[string]interface{}{
			{
				"type":          "text",
				"text":          analystSystemPrompt,
				"cache_control": map[string]string{"type": "ephemeral"},
			},
		},
		"messages": []map[string]interface{}{
			{
				"role":    "user",
				"content": string(contextJSON),
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

	text := extractJSON(stripMarkdownFence(apiResp.Content[0].Text))
	var output analystOutput
	if err := json.Unmarshal([]byte(text), &output); err != nil {
		return nil, fmt.Errorf("parse analyst output JSON: %w", err)
	}
	return &output, nil
}
