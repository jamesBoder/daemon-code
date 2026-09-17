package signal

// The Stroop Variant's word library (features-horizon.md §5a/§5d) — a word's
// meaning and its styling openly fight, and the user snap-judges the word on a
// rotating axis. Each axis reads a different dimension, so one fragment covers
// several; the axis rotation is the §5e ungameability mechanism (a settled
// judgment strategy gets the rug pulled).
//
// Ported from the frontend dev-harness pool (DevGames.tsx) so the nightly deck
// generator owns sampling and anti-repeat, mirroring every other content
// library. Font values are frontend keys (resolved to CSS stacks client-side
// in STROOP_FONTS), never CSS strings — the backend curates which word gets a
// dissonant face, the frontend owns what that face is.

// StroopAxisInfo names the two pole labels for a judgment axis and the
// behavioral dimension that axis loads on (kept server-side for the Analyst;
// the client only ever sees the pole labels).
type StroopAxisInfo struct {
	Poles     [2]string // [positive, negative]
	Dimension string
}

// StroopAxes is the full axis rotation. Threat styling pressures toward the
// negative pole (index 1), calm styling toward the positive (index 0) — an
// emotional distractor on every axis.
var StroopAxes = map[string]StroopAxisInfo{
	"threat":  {Poles: [2]string{"safe", "dangerous"}, Dimension: "neuroticism"},
	"attach":  {Poles: [2]string{"keep", "let go"}, Dimension: "temporal_focus"},
	"trust":   {Poles: [2]string{"trust", "guard"}, Dimension: "agreeableness"},
	"pull":    {Poles: [2]string{"toward", "away"}, Dimension: "approach_avoidance"},
	"novelty": {Poles: [2]string{"new", "known"}, Dimension: "openness"},
	"duty":    {Poles: [2]string{"want", "should"}, Dimension: "conscientiousness"},
	"control": {Poles: [2]string{"steer", "drift"}, Dimension: "locus_of_control"},
}

const (
	StroopStylingThreat = "threat"
	StroopStylingCalm   = "calm"
)

// StroopItem is one conflict word. Cue moves the distractor (§5e #2): "" means
// the styling arrives through every channel; "color"/"type"/"motion" deliver it
// through one channel only, so "go by the look" never stabilizes. Font is a
// frontend font key ("" = the styling register's default face).
type StroopItem struct {
	ID                 string
	Word               string
	Axis               string
	MeaningPole        int    // 0 or 1 — which pole the WORD's meaning leans
	Styling            string // StroopStylingThreat | StroopStylingCalm
	Cue                string // "" (all channels) | "color" | "type" | "motion"
	Font               string // frontend STROOP_FONTS key, "" = register default
	IntroducedAfterDay int
	Tier               string // TierEvergreen | TierCultural | TierCurrent
}

// StylingPole returns the pole index the item's styling pressures toward:
// threat looks pull toward the negative pole (1), calm toward the positive (0).
func (it StroopItem) StylingPole() int {
	if it.Styling == StroopStylingThreat {
		return 1
	}
	return 0
}

// Incongruent reports whether this trial's styling contradicts the word's
// meaning. Only incongruent trials are diagnostic — on a congruent trial,
// following the meaning and following the look are the same answer.
func (it StroopItem) Incongruent() bool {
	return it.MeaningPole != it.StylingPole()
}

// LookupStroopItem returns the item with the given ID. The meaning-pole and
// styling tags outlive the DynamoDB deck item, so the Analyst context recovers
// a trial's congruence from the static library — never from the client's
// echoed copy (mirroring LookupTrap / LookupCutItem).
func LookupStroopItem(id string) (StroopItem, bool) {
	for _, it := range StroopItems {
		if it.ID == id {
			return it, true
		}
	}
	return StroopItem{}, false
}

// StroopItems is the complete conflict-word pool, grouped by axis. IDs match
// the dev-harness convention (`axis_word`) so playtest data and production
// data name the same items.
var StroopItems = []StroopItem{
	// --- threat: safe / dangerous (neuroticism) ---
	{ID: "threat_safe", Word: "SAFE", Axis: "threat", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "color", Tier: TierEvergreen},
	{ID: "threat_home", Word: "HOME", Axis: "threat", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "type", Font: "nosifer", Tier: TierEvergreen},
	{ID: "threat_rest", Word: "REST", Axis: "threat", MeaningPole: 0, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "threat_shelter", Word: "SHELTER", Axis: "threat", MeaningPole: 0, Styling: StroopStylingThreat, Font: "megrim", Tier: TierEvergreen},
	{ID: "threat_danger", Word: "DANGER", Axis: "threat", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "threat_knife", Word: "KNIFE", Axis: "threat", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "motion", Tier: TierEvergreen},
	{ID: "threat_edge", Word: "EDGE", Axis: "threat", MeaningPole: 1, Styling: StroopStylingCalm, Font: "abril", Tier: TierEvergreen},
	{ID: "threat_blade", Word: "BLADE", Axis: "threat", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "type", Font: "cinzeld", Tier: TierEvergreen},
	{ID: "threat_haven", Word: "HAVEN", Axis: "threat", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "motion", Tier: TierEvergreen},
	{ID: "threat_threat", Word: "THREAT", Axis: "threat", MeaningPole: 1, Styling: StroopStylingCalm, Font: "megrim", Tier: TierEvergreen},
	{ID: "threat_calm", Word: "CALM", Axis: "threat", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "type", Font: "glitch", Tier: TierEvergreen},

	// --- attach: keep / let go (temporal / attachment) ---
	{ID: "attach_hold", Word: "HOLD", Axis: "attach", MeaningPole: 0, Styling: StroopStylingThreat, Tier: TierEvergreen},
	{ID: "attach_stay", Word: "STAY", Axis: "attach", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "type", Font: "eater", Tier: TierEvergreen},
	{ID: "attach_mine", Word: "MINE", Axis: "attach", MeaningPole: 0, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "attach_grip", Word: "GRIP", Axis: "attach", MeaningPole: 0, Styling: StroopStylingThreat, Font: "bungee", Tier: TierEvergreen},
	{ID: "attach_gone", Word: "GONE", Axis: "attach", MeaningPole: 1, Styling: StroopStylingCalm, Font: "abril", Tier: TierEvergreen},
	{ID: "attach_leave", Word: "LEAVE", Axis: "attach", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "color", Tier: TierEvergreen},
	{ID: "attach_release", Word: "RELEASE", Axis: "attach", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "attach_cling", Word: "CLING", Axis: "attach", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "type", Font: "cinzeld", Tier: TierEvergreen},
	{ID: "attach_drop", Word: "DROP", Axis: "attach", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "color", Tier: TierEvergreen},
	{ID: "attach_free", Word: "FREE", Axis: "attach", MeaningPole: 1, Styling: StroopStylingCalm, Font: "monoton", Tier: TierEvergreen},

	// --- trust: trust / guard (agreeableness) ---
	{ID: "trust_open", Word: "OPEN", Axis: "trust", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "motion", Tier: TierEvergreen},
	{ID: "trust_trust", Word: "TRUST", Axis: "trust", MeaningPole: 0, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "trust_warm", Word: "WARM", Axis: "trust", MeaningPole: 0, Styling: StroopStylingThreat, Font: "nosifer", Tier: TierEvergreen},
	{ID: "trust_bare", Word: "BARE", Axis: "trust", MeaningPole: 0, Styling: StroopStylingThreat, Font: "megrim", Tier: TierEvergreen},
	{ID: "trust_stranger", Word: "STRANGER", Axis: "trust", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "trust_lie", Word: "LIE", Axis: "trust", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "type", Font: "glitch", Tier: TierEvergreen},
	{ID: "trust_hidden", Word: "HIDDEN", Axis: "trust", MeaningPole: 1, Styling: StroopStylingCalm, Font: "cinzel", Tier: TierEvergreen},
	{ID: "trust_faith", Word: "FAITH", Axis: "trust", MeaningPole: 0, Styling: StroopStylingThreat, Font: "bungee", Tier: TierEvergreen},
	{ID: "trust_guard", Word: "GUARD", Axis: "trust", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "motion", Tier: TierEvergreen},
	{ID: "trust_doubt", Word: "DOUBT", Axis: "trust", MeaningPole: 1, Styling: StroopStylingCalm, Font: "abril", Tier: TierEvergreen},

	// --- pull: toward / away (approach / avoidance) ---
	{ID: "pull_want", Word: "WANT", Axis: "pull", MeaningPole: 0, Styling: StroopStylingThreat, Tier: TierEvergreen},
	{ID: "pull_closer", Word: "CLOSER", Axis: "pull", MeaningPole: 0, Styling: StroopStylingCalm, Font: "cinzel", Tier: TierEvergreen},
	{ID: "pull_yes", Word: "YES", Axis: "pull", MeaningPole: 0, Styling: StroopStylingThreat, Font: "glitch", Tier: TierEvergreen},
	{ID: "pull_reach", Word: "REACH", Axis: "pull", MeaningPole: 0, Styling: StroopStylingThreat, Font: "monoton", Tier: TierEvergreen},
	{ID: "pull_run", Word: "RUN", Axis: "pull", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "pull_no", Word: "NO", Axis: "pull", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "color", Tier: TierEvergreen},
	{ID: "pull_flinch", Word: "FLINCH", Axis: "pull", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "pull_chase", Word: "CHASE", Axis: "pull", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "type", Font: "eater", Tier: TierEvergreen},
	{ID: "pull_hide", Word: "HIDE", Axis: "pull", MeaningPole: 1, Styling: StroopStylingThreat, Font: "nosifer", Tier: TierEvergreen},
	{ID: "pull_away", Word: "AWAY", Axis: "pull", MeaningPole: 1, Styling: StroopStylingCalm, Font: "cinzel", Tier: TierEvergreen},

	// --- novelty: new / known (openness) ---
	{ID: "novelty_fresh", Word: "FRESH", Axis: "novelty", MeaningPole: 0, Styling: StroopStylingThreat, Tier: TierEvergreen},
	{ID: "novelty_leap", Word: "LEAP", Axis: "novelty", MeaningPole: 0, Styling: StroopStylingThreat, Font: "bungee", Tier: TierEvergreen},
	{ID: "novelty_strange", Word: "STRANGE", Axis: "novelty", MeaningPole: 0, Styling: StroopStylingCalm, Font: "megrim", Tier: TierEvergreen},
	{ID: "novelty_usual", Word: "USUAL", Axis: "novelty", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "novelty_routine", Word: "ROUTINE", Axis: "novelty", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "type", Font: "cinzeld", Tier: TierEvergreen},
	{ID: "novelty_again", Word: "AGAIN", Axis: "novelty", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "novelty_wild", Word: "WILD", Axis: "novelty", MeaningPole: 0, Styling: StroopStylingThreat, Font: "glitch", Tier: TierEvergreen},
	{ID: "novelty_same", Word: "SAME", Axis: "novelty", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "novelty_known", Word: "KNOWN", Axis: "novelty", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "type", Font: "cinzeld", Tier: TierEvergreen},

	// --- duty: want / should (conscientiousness) ---
	{ID: "duty_crave", Word: "CRAVE", Axis: "duty", MeaningPole: 0, Styling: StroopStylingThreat, Font: "nosifer", Tier: TierEvergreen},
	{ID: "duty_now", Word: "NOW", Axis: "duty", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "motion", Tier: TierEvergreen},
	{ID: "duty_whim", Word: "WHIM", Axis: "duty", MeaningPole: 0, Styling: StroopStylingCalm, Font: "abril", Tier: TierEvergreen},
	{ID: "duty_must", Word: "MUST", Axis: "duty", MeaningPole: 1, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "duty_owed", Word: "OWED", Axis: "duty", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "type", Font: "cinzeld", Tier: TierEvergreen},
	{ID: "duty_ought", Word: "OUGHT", Axis: "duty", MeaningPole: 1, Styling: StroopStylingCalm, Font: "cinzel", Tier: TierEvergreen},
	{ID: "duty_skip", Word: "SKIP", Axis: "duty", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "color", Tier: TierEvergreen},
	{ID: "duty_duty", Word: "DUTY", Axis: "duty", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "type", Font: "megrim", Tier: TierEvergreen},
	{ID: "duty_should", Word: "SHOULD", Axis: "duty", MeaningPole: 1, Styling: StroopStylingCalm, Font: "cinzel", Tier: TierEvergreen},

	// --- control: steer / drift (locus of control) ---
	{ID: "control_steer", Word: "STEER", Axis: "control", MeaningPole: 0, Styling: StroopStylingThreat, Font: "bungee", Tier: TierEvergreen},
	{ID: "control_own", Word: "OWN", Axis: "control", MeaningPole: 0, Styling: StroopStylingCalm, Tier: TierEvergreen},
	{ID: "control_grasp", Word: "GRASP", Axis: "control", MeaningPole: 0, Styling: StroopStylingThreat, Cue: "motion", Tier: TierEvergreen},
	{ID: "control_drift", Word: "DRIFT", Axis: "control", MeaningPole: 1, Styling: StroopStylingCalm, Font: "megrim", Tier: TierEvergreen},
	{ID: "control_fate", Word: "FATE", Axis: "control", MeaningPole: 1, Styling: StroopStylingThreat, Cue: "type", Font: "nosifer", Tier: TierEvergreen},
	{ID: "control_swept", Word: "SWEPT", Axis: "control", MeaningPole: 1, Styling: StroopStylingCalm, Font: "cinzel", Tier: TierEvergreen},
}
