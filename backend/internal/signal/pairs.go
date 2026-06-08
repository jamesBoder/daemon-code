package signal

// DimSignal encodes which side of a Weighted Scale pair is "high" for a behavioral dimension.
// LeftHigh=true means the left option scores high on this dimension; false means the right option does.
type DimSignal struct {
	LeftHigh bool
}

// Pair describes a Weighted Scale pair with its hidden behavioral dimension tags.
// DimensionSignals keys match the dimension names in the profile_dimensions JSONB schema:
// openness, conscientiousness, agreeableness, neuroticism, locus_of_control,
// approach_avoidance, temporal_focus, discount_factor, grim_trigger, k_level.
//
// IntroducedAfterDay gates the pair from appearing before the user has enough
// session history to make the signal meaningful.
type Pair struct {
	PairID             string
	Left               string
	Right              string
	DimensionSignals   map[string]DimSignal
	IntroducedAfterDay int
	Difficulty         string // "easy" | "medium" | "hard"
}

// Pairs is the complete Weighted Scale pair library with behavioral dimension signal tags.
// internal/services/deck/generator.go derives its evergreen pair list from this slice.
var Pairs = []Pair{
	{
		PairID: "early_vs_on_time",
		Left:   "arriving 10 minutes early",
		Right:  "arriving exactly on time",
		DimensionSignals: map[string]DimSignal{
			// Early = builds protective buffer (higher anxiety/conscientiousness); on-time = precise control
			"conscientiousness": {LeftHigh: true},
			"neuroticism":       {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
	},
	{
		PairID: "winning_vs_ending",
		Left:   "winning the argument",
		Right:  "ending it",
		DimensionSignals: map[string]DimSignal{
			// Winning = insists on being right = low agreeableness, internal locus, holds position
			"agreeableness":    {LeftHigh: false},
			"locus_of_control": {LeftHigh: true},
			"grim_trigger":     {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
	},
	{
		PairID: "built_vs_felt",
		Left:   "what you built",
		Right:  "how you made people feel",
		DimensionSignals: map[string]DimSignal{
			// Built = internal achievement focus; felt = interpersonal/external validation
			"locus_of_control": {LeftHigh: true},
			"agreeableness":    {LeftHigh: false},
			"temporal_focus":   {LeftHigh: false}, // built = past-oriented
		},
		IntroducedAfterDay: 0,
		Difficulty:         "medium",
	},
	{
		PairID: "apology_gave_vs_owed",
		Left:   "the apology you gave",
		Right:  "the apology you're owed",
		DimensionSignals: map[string]DimSignal{
			// Gave = took action (internal, agreeable); owed = waiting for external actor
			"agreeableness":    {LeftHigh: true},
			"locus_of_control": {LeftHigh: true},
			"temporal_focus":   {LeftHigh: false}, // gave = carrying the past act
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
	},
	{
		PairID: "clean_slate_vs_built",
		Left:   "a clean slate",
		Right:  "everything you've built",
		DimensionSignals: map[string]DimSignal{
			// Clean slate = future-oriented, willing to discount past investment
			"temporal_focus":  {LeftHigh: true},
			"discount_factor": {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
	},
	{
		PairID: "city_from_vs_chose",
		Left:   "the city you're from",
		Right:  "the city you chose",
		DimensionSignals: map[string]DimSignal{
			// From = inherited/external/past; chose = agency/internal/future
			"temporal_focus":   {LeftHigh: false},
			"discount_factor":  {LeftHigh: false},
			"locus_of_control": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
	},
	{
		PairID: "five_year_plan_vs_gut",
		Left:   "the 5-year plan",
		Right:  "the feeling in your gut",
		DimensionSignals: map[string]DimSignal{
			// Plan = structured, future-oriented; gut = impulsive/present
			"conscientiousness": {LeftHigh: true},
			"discount_factor":   {LeftHigh: true},
			"temporal_focus":    {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
	},
	{
		PairID: "ending_book_vs_starting",
		Left:   "ending a great book",
		Right:  "starting a new one",
		DimensionSignals: map[string]DimSignal{
			// Ending = values closure/what's finished; starting = future possibility
			"temporal_focus":  {LeftHigh: false},
			"discount_factor": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
	},
	{
		PairID: "advice_gave_vs_followed",
		Left:   "the advice you gave",
		Right:  "the advice you followed",
		DimensionSignals: map[string]DimSignal{
			// Gave = directing others (authority/internal); followed = deferred to others (external)
			"locus_of_control": {LeftHigh: true},
			"agreeableness":    {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "hard",
	},
	{
		PairID: "speaking_vs_listening",
		Left:   "speaking first",
		Right:  "listening first",
		DimensionSignals: map[string]DimSignal{
			// Speaking first = lower agreeableness, approach-motivated
			"agreeableness":     {LeftHigh: false},
			"approach_avoidance": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
	},
	{
		PairID: "being_right_vs_peace",
		Left:   "being right",
		Right:  "being at peace",
		DimensionSignals: map[string]DimSignal{
			// Right = insists on correctness = lower agreeableness, higher neuroticism, holds position
			"agreeableness": {LeftHigh: false},
			"neuroticism":   {LeftHigh: true},
			"grim_trigger":  {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "medium",
	},
	{
		PairID: "version_others_remember_vs_self",
		Left:   "the version of you people remember",
		Right:  "the version you remember",
		DimensionSignals: map[string]DimSignal{
			// People-remember = external validation matters; self-remember = internal self-model
			"locus_of_control": {LeftHigh: false},
			"agreeableness":    {LeftHigh: true},
		},
		IntroducedAfterDay: 14,
		Difficulty:         "hard",
	},
}

// LookupPair returns the Pair entry matching left+right strings, and whether it was found.
// Used by the Analyst context assembly to attach dimension signals to weighted scale responses.
func LookupPair(left, right string) (Pair, bool) {
	for _, p := range Pairs {
		if p.Left == left && p.Right == right {
			return p, true
		}
	}
	return Pair{}, false
}
