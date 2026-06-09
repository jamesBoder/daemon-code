package signal

// Tier constants for content management. The Tier field is editorial metadata —
// the deck generator does not filter by tier; it uses IntroducedAfterDay + Difficulty.
const (
	TierEvergreen = "evergreen" // curate once, never expires
	TierCultural  = "cultural"  // ~5–10 year shelf life — review annually
	TierCurrent   = "current"   // ~6–18 months — rotate quarterly
)

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
	Tier               string // TierEvergreen | TierCultural | TierCurrent
}

// Pairs is the complete Weighted Scale pair library with behavioral dimension signal tags.
// Target: ~200 evergreen + ~150 cultural + ~50 current active; 400+ total.
// internal/services/deck/generator.go derives its pair pool from this slice via pickScalePairs.
var Pairs = []Pair{

	// =====================================================================
	// EVERGREEN — permanent library; curate once, never expires (~200 target)
	// =====================================================================

	// --- core behavioral anchors (Day 0, easy) ---
	{
		PairID: "early_vs_on_time",
		Left:   "arriving 10 minutes early",
		Right:  "arriving exactly on time",
		DimensionSignals: map[string]DimSignal{
			// Early = builds protective buffer (anxiety + conscientiousness); on-time = precise control
			"conscientiousness": {LeftHigh: true},
			"neuroticism":       {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
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
		Tier:               TierEvergreen,
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
		Tier:               TierEvergreen,
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
		Tier:               TierEvergreen,
	},
	{
		PairID: "speaking_vs_listening",
		Left:   "speaking first",
		Right:  "listening first",
		DimensionSignals: map[string]DimSignal{
			// Speaking first = assertive, approach-motivated
			"agreeableness":      {LeftHigh: false},
			"approach_avoidance": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "honest_answer_vs_kind_one",
		Left:   "the honest answer",
		Right:  "the kind one",
		DimensionSignals: map[string]DimSignal{
			// Honest = truth over harmony = lower agreeableness
			"agreeableness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "keeping_peace_vs_saying_thing",
		Left:   "keeping the peace",
		Right:  "saying the thing",
		DimensionSignals: map[string]DimSignal{
			// Keeping peace = high agreeableness, external orientation
			"agreeableness":    {LeftHigh: true},
			"locus_of_control": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "door_opened_vs_walked_past",
		Left:   "the door you opened",
		Right:  "the one you walked past",
		DimensionSignals: map[string]DimSignal{
			"approach_avoidance": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "reaching_first_vs_waiting",
		Left:   "reaching first",
		Right:  "waiting to be reached",
		DimensionSignals: map[string]DimSignal{
			// Reaching = approach-motivated, internal locus, assertive
			"approach_avoidance": {LeftHigh: true},
			"locus_of_control":   {LeftHigh: true},
			"agreeableness":      {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "letting_go_vs_keeping_score",
		Left:   "letting it go",
		Right:  "keeping score",
		DimensionSignals: map[string]DimSignal{
			// Keeping score = right = high grim trigger; letting go = future-oriented
			"grim_trigger":   {LeftHigh: false},
			"temporal_focus": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "second_chance_vs_first_impression",
		Left:   "a second chance",
		Right:  "a first impression",
		DimensionSignals: map[string]DimSignal{
			// Second chance = resets; first impression = anchors past = high grim trigger
			"grim_trigger":   {LeftHigh: false},
			"temporal_focus": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "shortcut_vs_longer_road",
		Left:   "the shortcut",
		Right:  "the longer road",
		DimensionSignals: map[string]DimSignal{
			// Shortcut = immediate = low patience; longer road = disciplined
			"discount_factor":   {LeftHigh: false},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "available_now_vs_holding_out_for",
		Left:   "what's available now",
		Right:  "what you're holding out for",
		DimensionSignals: map[string]DimSignal{
			// Available now = immediate = low discount factor; holding out = patient
			"discount_factor": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "what_came_from_vs_building_toward",
		Left:   "what you came from",
		Right:  "what you're building toward",
		DimensionSignals: map[string]DimSignal{
			// Came from = past origins = low temporal focus, external locus
			"temporal_focus":   {LeftHigh: false},
			"locus_of_control": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "what_made_happen_vs_happened_to_you",
		Left:   "what you made happen",
		Right:  "what happened to you",
		DimensionSignals: map[string]DimSignal{
			"locus_of_control": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "luck_vs_preparation",
		Left:   "luck",
		Right:  "preparation",
		DimensionSignals: map[string]DimSignal{
			// Luck = external; preparation = internal, disciplined
			"locus_of_control":  {LeftHigh: false},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "opportunity_came_vs_built",
		Left:   "the opportunity that came to you",
		Right:  "the one you built",
		DimensionSignals: map[string]DimSignal{
			// Came = external; built = internal, disciplined
			"locus_of_control":  {LeftHigh: false},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "kept_up_vs_slept_through",
		Left:   "the thing that kept you up last night",
		Right:  "the one you slept right through",
		DimensionSignals: map[string]DimSignal{
			// Kept up = rumination = high neuroticism
			"neuroticism": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "preparing_worst_vs_planning_best",
		Left:   "preparing for the worst",
		Right:  "planning for the best",
		DimensionSignals: map[string]DimSignal{
			// Worst-case preparation = anxiety-driven = high neuroticism
			"neuroticism": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "might_go_wrong_vs_already_gone_right",
		Left:   "what might still go wrong",
		Right:  "what has already gone right",
		DimensionSignals: map[string]DimSignal{
			// Future threat focus = high neuroticism; also future-oriented
			"neuroticism":    {LeftHigh: true},
			"temporal_focus": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "list_in_head_vs_feeling_in_chest",
		Left:   "the list in your head",
		Right:  "the feeling in your chest",
		DimensionSignals: map[string]DimSignal{
			// List = organized; feeling in chest = reactive/emotional = high neuroticism
			"conscientiousness": {LeftHigh: true},
			"neuroticism":       {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "saying_directly_vs_letting_figure_out",
		Left:   "saying it directly",
		Right:  "letting them figure it out",
		DimensionSignals: map[string]DimSignal{
			// Direct = assertive, takes responsibility for communication
			"agreeableness":    {LeftHigh: false},
			"locus_of_control": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "looking_back_vs_looking_forward",
		Left:   "looking back on it",
		Right:  "looking forward to what's next",
		DimensionSignals: map[string]DimSignal{
			"temporal_focus": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "how_far_come_vs_far_to_go",
		Left:   "how far you've come",
		Right:  "how far there is to go",
		DimensionSignals: map[string]DimSignal{
			// Looking back = past; right = gap focus = anxious-future
			"temporal_focus": {LeftHigh: false},
			"neuroticism":    {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "genre_always_return_vs_never_tried",
		Left:   "the genre you always return to",
		Right:  "the one you've never tried",
		DimensionSignals: map[string]DimSignal{
			// Return = low openness (conventional preference); never tried = high openness
			"openness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "conclusion_vs_process",
		Left:   "the conclusion",
		Right:  "the process",
		DimensionSignals: map[string]DimSignal{
			// Conclusion = goal-driven, convergent; process = open, experiential
			"conscientiousness": {LeftHigh: true},
			"openness":          {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "rough_draft_vs_finished",
		Left:   "the rough draft",
		Right:  "the finished version",
		DimensionSignals: map[string]DimSignal{
			// Rough draft = process, open to change = high openness, low conscientiousness
			"openness":          {LeftHigh: true},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "plan_held_vs_pivot_worked",
		Left:   "the plan that held",
		Right:  "the pivot that worked",
		DimensionSignals: map[string]DimSignal{
			// Plan = structured; pivot = approach-motivated (moving into the change)
			"conscientiousness":  {LeftHigh: true},
			"approach_avoidance": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "early_morning_vs_late_night",
		Left:   "the early morning",
		Right:  "the late night",
		DimensionSignals: map[string]DimSignal{
			// Early morning = structured, disciplined
			"conscientiousness": {LeftHigh: true},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "backup_plan_vs_pivot",
		Left:   "having a backup plan",
		Right:  "pivoting when it falls apart",
		DimensionSignals: map[string]DimSignal{
			// Backup plan = anxiety-driven preparation; pivot = approach new direction
			"conscientiousness":  {LeftHigh: true},
			"neuroticism":        {LeftHigh: true},
			"approach_avoidance": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "response_sent_immediately_vs_deleted",
		Left:   "the response you sent immediately",
		Right:  "the one you wrote and deleted",
		DimensionSignals: map[string]DimSignal{
			// Immediate = reactive = low k_level; deleted = over-revised = high neuroticism
			"k_level":     {LeftHigh: false},
			"neuroticism": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},
	{
		PairID: "being_understood_vs_understanding",
		Left:   "being understood",
		Right:  "understanding",
		DimensionSignals: map[string]DimSignal{
			// Being understood = seeking external reception = low locus;
			// understanding = active attention to others = high agreeableness
			"locus_of_control": {LeftHigh: false},
			"agreeableness":    {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierEvergreen,
	},

	// --- medium: needs a little history ---
	{
		PairID: "built_vs_felt",
		Left:   "what you built",
		Right:  "how you made people feel",
		DimensionSignals: map[string]DimSignal{
			// Built = internal achievement focus; felt = interpersonal/external validation
			"locus_of_control": {LeftHigh: true},
			"agreeableness":    {LeftHigh: false},
			"temporal_focus":   {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
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
		Tier:               TierEvergreen,
	},
	{
		PairID: "committing_early_vs_keeping_options",
		Left:   "committing early",
		Right:  "keeping your options open",
		DimensionSignals: map[string]DimSignal{
			// Options open = values future optionality = high discount factor, future-oriented
			"conscientiousness": {LeftHigh: true},
			"discount_factor":   {LeftHigh: false},
			"temporal_focus":    {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
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
		Tier:               TierEvergreen,
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
		Tier:               TierEvergreen,
	},
	{
		PairID: "apology_gave_vs_owed",
		Left:   "the apology you gave",
		Right:  "the apology you're owed",
		DimensionSignals: map[string]DimSignal{
			// Gave = took action (internal, agreeable); owed = waiting for external actor
			"agreeableness":    {LeftHigh: true},
			"locus_of_control": {LeftHigh: true},
			"temporal_focus":   {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "apology_changes_vs_doesnt_undo",
		Left:   "an apology that changes things",
		Right:  "one that doesn't undo them",
		DimensionSignals: map[string]DimSignal{
			// "Doesn't undo" = right = high grim trigger (past stays loaded)
			"grim_trigger":  {LeftHigh: false},
			"agreeableness": {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "hard_conversation_had_vs_putting_off",
		Left:   "the hard conversation you had",
		Right:  "the one you're still putting off",
		DimensionSignals: map[string]DimSignal{
			// Had = approach-motivated, internal; putting off = avoidance
			"approach_avoidance": {LeftHigh: true},
			"locus_of_control":   {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "risk_took_vs_calculated_to_death",
		Left:   "the risk you took",
		Right:  "the one you calculated to death",
		DimensionSignals: map[string]DimSignal{
			// Took = approach; calculated to death = right = high k_level (over-strategic)
			"approach_avoidance": {LeftHigh: true},
			"k_level":            {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "deadline_set_vs_found_you",
		Left:   "the deadline you set",
		Right:  "the one that found you",
		DimensionSignals: map[string]DimSignal{
			// Set = proactive, internal; found you = external, reactive
			"conscientiousness": {LeftHigh: true},
			"locus_of_control":  {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "what_they_did_vs_what_you_did_with_it",
		Left:   "what they did to you",
		Right:  "what you did with it",
		DimensionSignals: map[string]DimSignal{
			// They did = external; did with it = internal, forward-acting
			"locus_of_control": {LeftHigh: false},
			"temporal_focus":   {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "return_in_a_year_vs_next_month",
		Left:   "the return in a year",
		Right:  "the one next month",
		DimensionSignals: map[string]DimSignal{
			// Year = patient, future-oriented = high discount factor
			"discount_factor": {LeftHigh: true},
			"temporal_focus":  {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "promise_kept_vs_kept_breaking",
		Left:   "the promise you made and kept",
		Right:  "the one you kept breaking",
		DimensionSignals: map[string]DimSignal{
			// Kept = delayed gratification, disciplined
			"discount_factor":   {LeftHigh: true},
			"conscientiousness": {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "five_years_ago_vs_ahead",
		Left:   "the version of you five years ago",
		Right:  "the one five years from now",
		DimensionSignals: map[string]DimSignal{
			// Five years ago = past
			"temporal_focus": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "story_got_here_vs_still_writing",
		Left:   "the story of how you got here",
		Right:  "the one you're still writing",
		DimensionSignals: map[string]DimSignal{
			// Got here = past narrative; still writing = future possibility
			"temporal_focus":  {LeftHigh: false},
			"discount_factor": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "planting_trees_vs_tending_ones_there",
		Left:   "planting trees you'll never sit under",
		Right:  "tending the ones already there",
		DimensionSignals: map[string]DimSignal{
			// Planting = future-oriented, patience = high discount factor
			"discount_factor": {LeftHigh: true},
			"temporal_focus":  {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "explanation_satisfied_vs_opened_questions",
		Left:   "the explanation that satisfied you",
		Right:  "the one that opened more questions",
		DimensionSignals: map[string]DimSignal{
			// Satisfied = closed, resolved = low openness; more questions = high k_level
			"openness": {LeftHigh: false},
			"k_level":  {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "rule_makes_sense_vs_question",
		Left:   "the rule that makes sense to you",
		Right:  "the one you question",
		DimensionSignals: map[string]DimSignal{
			// Makes sense = conventional = low openness; question = internal judgment = high locus
			"openness":         {LeftHigh: false},
			"locus_of_control": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "whats_fair_vs_comfortable_room",
		Left:   "what's fair",
		Right:  "what keeps the room comfortable",
		DimensionSignals: map[string]DimSignal{
			// Fair = principles over harmony = low agreeableness
			"agreeableness": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "getting_credit_vs_getting_result",
		Left:   "getting the credit",
		Right:  "getting the result",
		DimensionSignals: map[string]DimSignal{
			// Credit = external validation = low locus, low conscientiousness
			"locus_of_control":  {LeftHigh: false},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "conversation_in_head_vs_actually_had",
		Left:   "the conversation you had in your head",
		Right:  "the one you actually had",
		DimensionSignals: map[string]DimSignal{
			// In head = avoidance, rumination = high neuroticism
			"approach_avoidance": {LeftHigh: false},
			"neuroticism":        {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "silence_after_vs_before",
		Left:   "the silence after you said it",
		Right:  "the one before",
		DimensionSignals: map[string]DimSignal{
			// After = approach taken; before = anticipatory anxiety = high neuroticism
			"approach_avoidance": {LeftHigh: true},
			"neuroticism":        {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},
	{
		PairID: "choice_for_yourself_vs_someone_else",
		Left:   "the choice you made for yourself",
		Right:  "the one you made for someone else",
		DimensionSignals: map[string]DimSignal{
			// Yourself = internal; someone else = accommodating = high agreeableness
			"locus_of_control": {LeftHigh: true},
			"agreeableness":    {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierEvergreen,
	},

	// --- hard: need deeper context ---
	{
		PairID: "advice_gave_vs_followed",
		Left:   "the advice you gave",
		Right:  "the advice you followed",
		DimensionSignals: map[string]DimSignal{
			// Gave = directing others (internal); followed = deferred to others (external)
			"locus_of_control": {LeftHigh: true},
			"agreeableness":    {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "hard",
		Tier:               TierEvergreen,
	},
	{
		PairID: "need_expressed_vs_carried_alone",
		Left:   "the need you expressed",
		Right:  "the one you carried alone",
		DimensionSignals: map[string]DimSignal{
			// Expressed = assertive, approach; carried = avoidant, low agreeableness toward self
			"agreeableness":      {LeftHigh: false},
			"locus_of_control":   {LeftHigh: true},
			"approach_avoidance": {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "hard",
		Tier:               TierEvergreen,
	},
	{
		PairID: "version_performed_vs_actually_were",
		Left:   "the version of you that you performed",
		Right:  "the one you actually were",
		DimensionSignals: map[string]DimSignal{
			// Performed = external audience-driven = low locus, high agreeableness (accommodating)
			"locus_of_control": {LeftHigh: false},
			"agreeableness":    {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "hard",
		Tier:               TierEvergreen,
	},
	{
		PairID: "version_others_remember_vs_self",
		Left:   "the version of you people remember",
		Right:  "the version you remember",
		DimensionSignals: map[string]DimSignal{
			// People-remember = external validation; self-remember = internal self-model
			"locus_of_control": {LeftHigh: false},
			"agreeableness":    {LeftHigh: true},
		},
		IntroducedAfterDay: 14,
		Difficulty:         "hard",
		Tier:               TierEvergreen,
	},
	{
		PairID: "room_smartest_vs_wasnt",
		Left:   "the room where you were the smartest",
		Right:  "the one where you weren't",
		DimensionSignals: map[string]DimSignal{
			// Smartest = comfort = low openness; wasn't = challenged = high openness, high k_level
			"openness": {LeftHigh: false},
			"k_level":  {LeftHigh: false},
		},
		IntroducedAfterDay: 14,
		Difficulty:         "hard",
		Tier:               TierEvergreen,
	},
	{
		PairID: "mentor_found_vs_became",
		Left:   "the mentor you found",
		Right:  "the one you became",
		DimensionSignals: map[string]DimSignal{
			// Found = past, external influence; became = internal agency
			"temporal_focus":   {LeftHigh: false},
			"locus_of_control": {LeftHigh: false},
		},
		IntroducedAfterDay: 14,
		Difficulty:         "hard",
		Tier:               TierEvergreen,
	},
	{
		PairID: "relationship_changed_you_vs_one_you_changed",
		Left:   "the relationship that changed you",
		Right:  "the one you changed",
		DimensionSignals: map[string]DimSignal{
			// Changed you = external influence, past; you changed = internal, agency
			"locus_of_control": {LeftHigh: false},
			"temporal_focus":   {LeftHigh: false},
		},
		IntroducedAfterDay: 14,
		Difficulty:         "hard",
		Tier:               TierEvergreen,
	},

	// =====================================================================
	// CULTURAL — ~5–10 year shelf life; review annually (~150 target)
	// =====================================================================

	{
		PairID: "beatles_vs_stones",
		Left:   "The Beatles breaking up",
		Right:  "The Rolling Stones staying together",
		DimensionSignals: map[string]DimSignal{
			// Beatles = accepting the natural end = future-oriented, discounts sunk investment;
			// Stones = endurance, showing up every decade = high conscientiousness
			"temporal_focus":    {LeftHigh: true},
			"discount_factor":   {LeftHigh: true},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "jobs_vs_gates",
		Left:   "Steve Jobs",
		Right:  "Bill Gates",
		DimensionSignals: map[string]DimSignal{
			// Jobs = artistic/visionary = high openness; Gates = systematic/patient = high conscientiousness, high discount_factor
			"openness":          {LeftHigh: true},
			"conscientiousness": {LeftHigh: false},
			"discount_factor":   {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "breaking_bad_vs_sopranos",
		Left:   "Breaking Bad",
		Right:  "The Sopranos",
		DimensionSignals: map[string]DimSignal{
			// Walter White = cold calculation, methodical, burns bridges;
			// Tony Soprano = impulsive, inherited world, emotional
			"k_level":           {LeftHigh: true},
			"conscientiousness": {LeftHigh: true},
			"grim_trigger":      {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "kendrick_vs_drake",
		Left:   "Kendrick Lamar",
		Right:  "Drake",
		DimensionSignals: map[string]DimSignal{
			// Kendrick = craft-first, uncompromising, experimental;
			// Drake = crowd-pleasing, commercial, accessible
			"locus_of_control": {LeftHigh: true},
			"agreeableness":    {LeftHigh: false},
			"openness":         {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "garage_startup_vs_corporate_ladder",
		Left:   "the garage startup",
		Right:  "the corporate ladder",
		DimensionSignals: map[string]DimSignal{
			// Garage = internal agency, long-shot patience; corporate = structured path, security-seeking
			"locus_of_control":  {LeftHigh: true},
			"discount_factor":   {LeftHigh: true},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierCultural,
	},
	{
		PairID: "the_office_vs_the_wire",
		Left:   "The Office",
		Right:  "The Wire",
		DimensionSignals: map[string]DimSignal{
			// The Office = accessible, low-demand; The Wire = complex, systemic, high k_level
			"openness": {LeftHigh: false},
			"k_level":  {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "jordan_vs_lebron",
		Left:   "Jordan",
		Right:  "LeBron",
		DimensionSignals: map[string]DimSignal{
			// Jordan = relentless, never forgets a slight, obsessive prep;
			// LeBron = team-builder, more collaborative
			"grim_trigger":      {LeftHigh: true},
			"conscientiousness": {LeftHigh: true},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "startup_equity_vs_steady_paycheck",
		Left:   "startup equity",
		Right:  "a steady paycheck",
		DimensionSignals: map[string]DimSignal{
			// Equity = patient, internal agency, low security-seeking;
			// Paycheck = security-seeking = high neuroticism (threat reduction), low discount
			"discount_factor":  {LeftHigh: true},
			"locus_of_control": {LeftHigh: true},
			"neuroticism":      {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "going_viral_vs_lasting_impact",
		Left:   "going viral",
		Right:  "lasting impact",
		DimensionSignals: map[string]DimSignal{
			// Viral = immediate = low discount, past-now anchored;
			// Impact = future-oriented, patient
			"discount_factor":   {LeftHigh: false},
			"temporal_focus":    {LeftHigh: false},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "moving_fast_vs_measuring_twice",
		Left:   "moving fast and breaking things",
		Right:  "measuring twice and cutting once",
		DimensionSignals: map[string]DimSignal{
			// Move fast = reactive, low conscientiousness, low discount;
			// Measure twice = deliberate, high k_level
			"conscientiousness": {LeftHigh: false},
			"k_level":           {LeftHigh: false},
			"discount_factor":   {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "ted_lasso_vs_roy_kent",
		Left:   "Ted Lasso",
		Right:  "Roy Kent",
		DimensionSignals: map[string]DimSignal{
			// Ted = high agreeableness, resets (low grim trigger);
			// Roy = fierce internal code, holds grudges (high grim trigger)
			"agreeableness": {LeftHigh: true},
			"grim_trigger":  {LeftHigh: false},
		},
		IntroducedAfterDay: 7,
		Difficulty:         "medium",
		Tier:               TierCultural,
	},
	{
		PairID: "therapy_vs_working_through_it",
		Left:   "therapy",
		Right:  "just working through it",
		DimensionSignals: map[string]DimSignal{
			// Therapy = accepts external support = low locus (in the sense of seeking outside help),
			// high agreeableness (openness to guidance)
			"locus_of_control": {LeftHigh: false},
			"agreeableness":    {LeftHigh: true},
		},
		IntroducedAfterDay: 14,
		Difficulty:         "hard",
		Tier:               TierCultural,
	},

	// =====================================================================
	// CURRENT — ~6–18 month shelf life; rotate quarterly (~50 active target)
	// =====================================================================

	{
		PairID: "using_ai_vs_doing_it_yourself",
		Left:   "using AI to do it faster",
		Right:  "doing it yourself to do it right",
		DimensionSignals: map[string]DimSignal{
			// AI = offloading = low locus, low conscientiousness, low discount (speed now);
			// yourself = internal control, disciplined, patient
			"discount_factor":   {LeftHigh: false},
			"locus_of_control":  {LeftHigh: false},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierCurrent,
	},
	{
		PairID: "remote_work_vs_office",
		Left:   "remote work",
		Right:  "the office",
		DimensionSignals: map[string]DimSignal{
			// Remote = autonomy, internal structure; office = external structure, social
			"locus_of_control":  {LeftHigh: true},
			"agreeableness":     {LeftHigh: false},
			"conscientiousness": {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierCurrent,
	},
	{
		PairID: "doomscrolling_vs_logging_off",
		Left:   "doomscrolling",
		Right:  "logging off",
		DimensionSignals: map[string]DimSignal{
			// Doomscrolling = avoidance through distraction = high neuroticism, low conscientiousness
			"neuroticism":        {LeftHigh: true},
			"approach_avoidance": {LeftHigh: false},
			"conscientiousness":  {LeftHigh: false},
		},
		IntroducedAfterDay: 0,
		Difficulty:         "easy",
		Tier:               TierCurrent,
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

// LookupPairsByTier returns all pairs for the given tier.
// Useful for content audits and editorial tooling; not used by the deck generator.
func LookupPairsByTier(tier string) []Pair {
	var result []Pair
	for _, p := range Pairs {
		if p.Tier == tier {
			result = append(result, p)
		}
	}
	return result
}
