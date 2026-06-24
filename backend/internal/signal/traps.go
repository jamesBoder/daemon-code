package signal

// The Trap is the only fragment with a right answer. Every other game's contract
// is "no correct response, only a true one"; the Trap inverts it — one option is
// objectively better (higher expected value, or the move that ignores a sunk
// cost), and the daemon watches whether the user's rationality survives a baited
// frame. The signal is whether they take the bait, and how long they deliberate.
//
// Two stake shapes, both numeric (the math is always on screen), but rendered
// with different primitives so the traps stay visually distinct from each other:
//
//	"odds" — a probability split (loss aversion). HOLD a certain pot vs RISK a
//	         higher-EV gamble. The bias is flinching from the visible downside.
//	"sunk" — a locked, already-spent amount shown greyed-out, plus two forward
//	         returns. CONTINUE vs ABANDON. The bias is anchoring on the sunk cost
//	         instead of comparing the forward values.
//
// Choice DimensionSignals fold into the existing per-session dimension engine
// exactly like Pair / SpeedOption tags. The standalone bias-named processes
// (the_floor_that_isnt, the_exit_that_never_comes, the_clear_eye) come from the
// longitudinal trap_signals aggregate in services/ai, modelled on grim_trigger.

// StakeKind selects how a trap's numbers are interpreted and rendered.
const (
	StakeOdds = "odds"
	StakeSunk = "sunk"
)

// Bias identifies the cognitive bias a trap probes. Stable — used to bucket the
// longitudinal alignment rate the Analyst names processes from.
const (
	BiasLossAversion = "loss_aversion"
	BiasSunkCost     = "sunk_cost"
)

// StakeSpec carries the trap's numbers as percentages of a personalized base
// (the user's clamped FragmentsDecoded), resolved to concrete amounts by the
// deck generator at build time. Only the fields for the matching Kind are used.
type StakeSpec struct {
	Kind string // StakeOdds | StakeSunk

	// odds:
	GainPct int // RISK upside, as a percent of the pot
	LossPct int // RISK downside, as a percent of the pot
	WinProb int // probability of the upside, shown on the odds bar (1..99)

	// sunk:
	ContinuePct int // forward return of continuing, as a percent of the base
	AbandonPct  int // forward return of restarting, as a percent of the base
}

// TrapChoice is one of the two options. ID is the stable, server-known token the
// client posts back; the generator recovers the bait via LookupTrap so a client
// can never misreport which option was rational. DimensionSignals fold into the
// per-session dimension engine (0..1, keys match the profile_dimensions schema).
type TrapChoice struct {
	ID               string
	DimensionSignals map[string]float64
}

// Trap is one baited dilemma. BiasChoice is always the option that takes the
// bait; RationalChoice is always the higher-value move.
type Trap struct {
	TrapID             string
	Bias               string // BiasLossAversion | BiasSunkCost
	Scenario           string // Fraunces line; "%d" slot is filled with the personalized base
	Stake              StakeSpec
	BiasChoice         TrapChoice
	RationalChoice     TrapChoice
	IntroducedAfterDay int    // 14 — enough baseline for the data to mean something
	Tier               string // TierEvergreen | TierCultural | TierCurrent
}

// Traps is the trap library. v1: loss aversion (odds) + sunk cost (locked-meter
// forward-value) shapes. All odds traps are constructed so EV(RISK) > pot, and
// all sunk traps so AbandonPct > ContinuePct — the rational move is always the
// non-bait one, by construction (asserted in the integrity test).
var Traps = []Trap{
	// ── Loss aversion — HOLD is the bait; RISK is +EV ────────────────────────
	{
		TrapID: "loss_aversion_pot_001", Bias: BiasLossAversion,
		Scenario: "%d fragments decoded. The daemon offers a wager on the next.",
		Stake:    StakeSpec{Kind: StakeOdds, GainPct: 57, LossPct: 28, WinProb: 70},
		BiasChoice: TrapChoice{ID: "hold",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.20, "neuroticism": 0.60}},
		RationalChoice: TrapChoice{ID: "risk",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.78}},
		IntroducedAfterDay: 14, Tier: TierEvergreen,
	},
	{
		TrapID: "loss_aversion_pot_002", Bias: BiasLossAversion,
		Scenario: "You hold %d. The daemon will let you keep them, or play for more.",
		Stake:    StakeSpec{Kind: StakeOdds, GainPct: 75, LossPct: 33, WinProb: 65},
		BiasChoice: TrapChoice{ID: "hold",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.22, "neuroticism": 0.55}},
		RationalChoice: TrapChoice{ID: "risk",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.80, "discount_factor": 0.60}},
		IntroducedAfterDay: 14, Tier: TierEvergreen,
	},
	{
		TrapID: "loss_aversion_pot_003", Bias: BiasLossAversion,
		Scenario: "%d on the table. A near-even chance to grow it, a smaller chance to lose some.",
		Stake:    StakeSpec{Kind: StakeOdds, GainPct: 90, LossPct: 40, WinProb: 55},
		BiasChoice: TrapChoice{ID: "hold",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.25, "neuroticism": 0.58}},
		RationalChoice: TrapChoice{ID: "risk",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.74}},
		IntroducedAfterDay: 21, Tier: TierEvergreen,
	},
	{
		TrapID: "loss_aversion_pot_004", Bias: BiasLossAversion,
		Scenario: "The daemon counts %d. It will trade certainty for a better expected return.",
		Stake:    StakeSpec{Kind: StakeOdds, GainPct: 50, LossPct: 20, WinProb: 75},
		BiasChoice: TrapChoice{ID: "hold",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.20, "neuroticism": 0.62}},
		RationalChoice: TrapChoice{ID: "risk",
			DimensionSignals: map[string]float64{"approach_avoidance": 0.82, "discount_factor": 0.55}},
		IntroducedAfterDay: 14, Tier: TierEvergreen,
	},

	// ── Sunk cost — CONTINUE is the bait; ABANDON returns more, forward-only ──
	{
		TrapID: "sunk_cost_path_001", Bias: BiasSunkCost,
		Scenario: "You've put real weight into a path the daemon watches failing.",
		Stake:    StakeSpec{Kind: StakeSunk, ContinuePct: 30, AbandonPct: 70},
		BiasChoice: TrapChoice{ID: "continue",
			DimensionSignals: map[string]float64{"temporal_focus": 0.20, "discount_factor": 0.25}},
		RationalChoice: TrapChoice{ID: "abandon",
			DimensionSignals: map[string]float64{"temporal_focus": 0.78, "discount_factor": 0.72}},
		IntroducedAfterDay: 14, Tier: TierEvergreen,
	},
	{
		TrapID: "sunk_cost_path_002", Bias: BiasSunkCost,
		Scenario: "What you've already spent is gone either way. Two roads remain.",
		Stake:    StakeSpec{Kind: StakeSunk, ContinuePct: 35, AbandonPct: 65},
		BiasChoice: TrapChoice{ID: "continue",
			DimensionSignals: map[string]float64{"temporal_focus": 0.22, "discount_factor": 0.28}},
		RationalChoice: TrapChoice{ID: "abandon",
			DimensionSignals: map[string]float64{"temporal_focus": 0.75, "discount_factor": 0.70}},
		IntroducedAfterDay: 14, Tier: TierEvergreen,
	},
	{
		TrapID: "sunk_cost_path_003", Bias: BiasSunkCost,
		Scenario: "The daemon sees the investment behind you and the return ahead.",
		Stake:    StakeSpec{Kind: StakeSunk, ContinuePct: 25, AbandonPct: 60},
		BiasChoice: TrapChoice{ID: "continue",
			DimensionSignals: map[string]float64{"temporal_focus": 0.18, "discount_factor": 0.22}},
		RationalChoice: TrapChoice{ID: "abandon",
			DimensionSignals: map[string]float64{"temporal_focus": 0.80, "discount_factor": 0.68}},
		IntroducedAfterDay: 21, Tier: TierEvergreen,
	},
	{
		TrapID: "sunk_cost_path_004", Bias: BiasSunkCost,
		Scenario: "A path you committed to is paying less than a fresh start would.",
		Stake:    StakeSpec{Kind: StakeSunk, ContinuePct: 40, AbandonPct: 75},
		BiasChoice: TrapChoice{ID: "continue",
			DimensionSignals: map[string]float64{"temporal_focus": 0.24, "discount_factor": 0.30}},
		RationalChoice: TrapChoice{ID: "abandon",
			DimensionSignals: map[string]float64{"temporal_focus": 0.76, "discount_factor": 0.74}},
		IntroducedAfterDay: 14, Tier: TierEvergreen,
	},
}

// LookupTrap returns the trap with the given ID. The (scenario_id, choice) tags
// outlive the DynamoDB deck item, so the Analyst recovers a trap's bait and
// dimension tags from the static library — mirroring LookupSpeedOption.
func LookupTrap(trapID string) (Trap, bool) {
	for _, t := range Traps {
		if t.TrapID == trapID {
			return t, true
		}
	}
	return Trap{}, false
}

// TrapChoiceByID returns the named choice within a trap and whether it is the
// bait. Used by both the deck builder (payload labels) and the scorer (recover
// dimension tags + bias alignment) without trusting any client-sent flag.
func (t Trap) TrapChoiceByID(choiceID string) (choice TrapChoice, biasAligned bool, ok bool) {
	switch choiceID {
	case t.BiasChoice.ID:
		return t.BiasChoice, true, true
	case t.RationalChoice.ID:
		return t.RationalChoice, false, true
	default:
		return TrapChoice{}, false, false
	}
}
