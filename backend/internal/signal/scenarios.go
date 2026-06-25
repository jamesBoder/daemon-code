package signal

// ScenarioType categorizes The Map scenarios by content register.
type ScenarioType string

// ScenarioTier gates scenarios by profile maturity (compile-count units).
type ScenarioTier string

const (
	ScenarioConflict      ScenarioType = "conflict"
	ScenarioLoss          ScenarioType = "loss"
	ScenarioHistorical    ScenarioType = "historical"
	ScenarioMoral         ScenarioType = "moral"
	ScenarioCultural      ScenarioType = "cultural"
	ScenarioPhilosophical ScenarioType = "philosophical"
	ScenarioDaemon        ScenarioType = "daemon"

	TierUniversal   ScenarioTier = "universal"
	TierDimensional ScenarioTier = "dimensional"
	TierPersonal    ScenarioTier = "personal"
)

// NodeDimSignal encodes the directional pole a node activates on one dimension.
// Direction vocabulary: "high"/"low" for most dimensions, "internal"/"external"
// for locus_of_control, "past"/"future" for temporal_focus.
// (Named NodeDimSignal rather than DimSignal — pairs.go already owns that name.)
type NodeDimSignal struct {
	Direction string
}

// ScenarioNode is one behavioral node in a scenario's pool.
// NodeID is a stable library ID, unique within the scenario's NodePool — never
// positional. card_responses rows outlive the DynamoDB item, so the Analyst
// recovers dimension tags via LookupScenarioNode(scenarioID, nodeID).
// PrimaryDimension is explicit because DimensionSignals is unordered; it drives
// the isolated-node avoidance signal.
type ScenarioNode struct {
	NodeID           string
	Text             string
	PrimaryDimension string
	DimensionSignals map[string]NodeDimSignal
}

// Scenario is one curated Map scenario with its oblique node pool.
type Scenario struct {
	ScenarioID         string
	Type               ScenarioType
	Tier               ScenarioTier
	Text               string
	NodePool           []ScenarioNode // 10–15 nodes; generator selects 6
	DimensionAffinity  []string       // dimensions this scenario probes best
	IntroducedAfterDay int
}

// FallbackObservation is written when the Phase B Claude call fails —
// a hedged Map beats no Map.
const FallbackObservation = "Something in the pattern. The daemon is still reading."

// FallbackPredictions is the generic prediction pool for Phase B failures.
// All entries follow the prediction rules: near-future, verifiable, deniable,
// never the word "predict", never the game mechanic.
var FallbackPredictions = []string{
	"Sometime soon you will be offered an easy version of a hard thing. The daemon is watching which one you take.",
	"This week something small will ask more of you than it should. The daemon has noted what it expects.",
	"Someone will leave a door open for you in the next few days. The daemon already has a guess about the threshold.",
}

// Scenarios is the curated Map scenario library.
// Library: 20 scenarios, all universal tier — ~3 weeks of daily Maps without
// repeat. dimensional and personal tiers land in later iterations.
// Node texts obey the obliqueness rule: never the obvious reaction.
var Scenarios = []Scenario{
	{
		ScenarioID:        "colleague_credit_001",
		Type:              ScenarioConflict,
		Tier:              TierUniversal,
		Text:              "A colleague takes credit for your work. You're still in the room. Everyone saw it.",
		DimensionAffinity: []string{"grim_trigger", "agreeableness", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "version_kept", Text: "the version you kept", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "what_remains", Text: "what remains", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "the_witness", Text: "the witness", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "before_you_knew", Text: "before you knew", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "math_of_it", Text: "the math of it", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "what_holds", Text: "what holds", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "the_ledger", Text: "the ledger", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "door_half_open", Text: "the door half open", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "k_level": {Direction: "low"}}},
			{NodeID: "their_reasons", Text: "their reasons", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "the_long_game", Text: "the long game", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "what_you_didnt_say", Text: "what you didn't say", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "next_room", Text: "the next room", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "approach_avoidance": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "right_unsaid_002",
		Type:              ScenarioConflict,
		Tier:              TierUniversal,
		Text:              "You were right. Everyone knows it now. Nobody said anything.",
		DimensionAffinity: []string{"agreeableness", "grim_trigger", "neuroticism"},
		NodePool: []ScenarioNode{
			{NodeID: "the_receipt", Text: "the receipt", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "quiet_in_room", Text: "the quiet in the room", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "cost_of_saying", Text: "the cost of saying it", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "already_moved", Text: "where you'd already moved", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "their_faces", Text: "their faces", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_record", Text: "the record", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "old_wins", Text: "the old wins", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "never_needed", Text: "what you never needed from them", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "low"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "next_time", Text: "next time", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "small_door", Text: "the small door out", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "openness": {Direction: "low"}}},
			{NodeID: "what_it_proves", Text: "what it proves", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "low"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "unsaid_sentence", Text: "the sentence you didn't say", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "agreeableness": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "watched_regret_003",
		Type:              ScenarioConflict,
		Tier:              TierUniversal,
		Text:              "Someone you love makes a decision you watched them regret three years ago. They're making it again.",
		DimensionAffinity: []string{"agreeableness", "locus_of_control", "k_level"},
		NodePool: []ScenarioNode{
			{NodeID: "the_first_time", Text: "the first time", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "your_lines", Text: "your lines from last time", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "their_turn", Text: "their turn to choose", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "the_net", Text: "the net you could build", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "not_yours_to_stop", Text: "what isn't yours to stop", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "k_level": {Direction: "high"}}},
			{NodeID: "shape_made_twice", Text: "the shape it makes twice", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "after_the_fall", Text: "after the fall", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "silence_kept", Text: "the silence you're keeping", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "the_speech", Text: "the speech you rehearsed", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "watching_again", Text: "watching it again", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "what_love_is_for", Text: "what love is for", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "your_own_version", Text: "your own version of this", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "locus_of_control": {Direction: "internal"}}},
		},
	},
	{
		ScenarioID:        "got_what_wanted_004",
		Type:              ScenarioLoss,
		Tier:              TierUniversal,
		Text:              "You got what you wanted. It wasn't what you thought it would be.",
		DimensionAffinity: []string{"temporal_focus", "discount_factor", "neuroticism"},
		NodePool: []ScenarioNode{
			{NodeID: "the_wanting", Text: "the wanting itself", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "openness": {Direction: "high"}}},
			{NodeID: "the_list", Text: "the list you made", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "still_missing", Text: "what's still missing", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "the_next_thing", Text: "the next thing", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "who_you_told", Text: "who you told first", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_climb", Text: "the climb", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "quiet_after", Text: "the quiet after", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "keeping_it", Text: "keeping it anyway", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "what_it_cost", Text: "what it cost", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "k_level": {Direction: "high"}}},
			{NodeID: "room_it_bought", Text: "the room it bought", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "openness": {Direction: "high"}}},
			{NodeID: "who_wanted_it", Text: "the person who wanted it", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "not_telling_yet", Text: "not telling anyone yet", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "agreeableness": {Direction: "low"}}},
		},
	},
	{
		ScenarioID:        "old_street_005",
		Type:              ScenarioLoss,
		Tier:              TierUniversal,
		Text:              "The city you grew up in looks nothing like it did. You're standing on your old street.",
		DimensionAffinity: []string{"temporal_focus", "neuroticism", "openness"},
		NodePool: []ScenarioNode{
			{NodeID: "map_you_carry", Text: "the map you still carry", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "whats_gone", Text: "what's gone", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "the_new_paint", Text: "the new paint", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "who_stayed", Text: "who stayed", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "why_you_left", Text: "why you left", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "window_you_knew", Text: "the window you knew", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "still_standing", Text: "what's still standing", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "stranger_here", Text: "being a stranger here", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "the_way_back", Text: "the way back", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "citys_own_life", Text: "the city's own life", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "openness": {Direction: "high"}}},
			{NodeID: "what_you_took", Text: "what you took with you", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "next_visit", Text: "whether you'd come again", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "k_level": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "let_it_end_006",
		Type:              ScenarioLoss,
		Tier:              TierUniversal,
		Text:              "Something you built ended. Not because it failed — because you let it.",
		DimensionAffinity: []string{"locus_of_control", "temporal_focus", "grim_trigger"},
		NodePool: []ScenarioNode{
			{NodeID: "the_blueprint", Text: "the blueprint", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "the_letting_go", Text: "the letting go", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "at_its_best", Text: "what it was at its best", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "unadmitted_relief", Text: "the relief you don't admit", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "who_noticed", Text: "who noticed it ended", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "space_it_leaves", Text: "the space it leaves", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "restart_you_could", Text: "the restart you could do", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "naming_the_ending", Text: "naming the ending", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "still_proud", Text: "still proud of it", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "what_it_taught", Text: "what it taught", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "never_that_again", Text: "never building that again", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "next_build", Text: "the next thing you'd build", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "approach_avoidance": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "berlin_wall_007",
		Type:              ScenarioHistorical,
		Tier:              TierUniversal,
		Text:              "Berlin. November 9th, 1989. The wall is coming down. You're 24, standing at Checkpoint Charlie.",
		DimensionAffinity: []string{"approach_avoidance", "openness", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "hammer_in_hand", Text: "a hammer in someone's hand", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "the_other_side", Text: "the other side", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "guards_standing_down", Text: "the guards standing down", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "k_level": {Direction: "high"}}},
			{NodeID: "what_the_wall_kept", Text: "what the wall kept", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "openness": {Direction: "low"}}},
			{NodeID: "crowd_carrying_you", Text: "the crowd carrying you", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "piece_in_pocket", Text: "a piece in your pocket", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "who_youd_call", Text: "who you'd call first", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "morning_after", Text: "the morning after", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "k_level": {Direction: "high"}}},
			{NodeID: "years_it_stood", Text: "the years it stood", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "your_place_in_it", Text: "your place in it", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "openness": {Direction: "high"}}},
			{NodeID: "it_could_close", Text: "it could close again", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "just_watching", Text: "just watching", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "k_level": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "titanic_seat_008",
		Type:              ScenarioHistorical,
		Tier:              TierUniversal,
		Text:              "The Titanic has been filling for 45 minutes. You have a seat. Not everyone does.",
		DimensionAffinity: []string{"agreeableness", "neuroticism", "k_level"},
		NodePool: []ScenarioNode{
			{NodeID: "the_seat", Text: "the seat", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "who_doesnt", Text: "who doesn't have one", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "lottery_of_it", Text: "the lottery of it", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "openness": {Direction: "high"}}},
			{NodeID: "trade_you_could_make", Text: "the trade you could make", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "years_after", Text: "the years after", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "the_cold_math", Text: "the cold math", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "agreeableness": {Direction: "low"}}},
			{NodeID: "who_youd_live_for", Text: "who you'd live for", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "story_youd_tell", Text: "the story you'd tell", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "frozen_still", Text: "not being able to move", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "band_still_playing", Text: "the band still playing", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "what_deserving_means", Text: "what deserving means", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "where_youd_look", Text: "where you'd look", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "neuroticism": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "moon_landing_009",
		Type:              ScenarioHistorical,
		Tier:              TierUniversal,
		Text:              "1969. You're watching the moon landing alone in a hotel room in a city that isn't yours.",
		DimensionAffinity: []string{"openness", "locus_of_control", "temporal_focus"},
		NodePool: []ScenarioNode{
			{NodeID: "the_static", Text: "the static", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "alone_for_this", Text: "being alone for this", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "everyone_at_once", Text: "everyone watching at once", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_distance", Text: "the distance up there", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "why_this_city", Text: "why you're in this city", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "calling_home_after", Text: "calling home after", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "whats_possible_now", Text: "what's possible now", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "openness": {Direction: "high"}}},
			{NodeID: "the_small_room", Text: "the small room", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "decade_behind_it", Text: "the decade of work behind it", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "your_own_moon", Text: "your own version of the moon", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "coming_back_down", Text: "the coming back down", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "broadcast_ending", Text: "the broadcast ending", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
		},
	},
	{
		ScenarioID:        "comments_open_010",
		Type:              ScenarioMoral,
		Tier:              TierUniversal,
		Text:              "A public figure you respected says something you find inexcusable. The comments are open.",
		DimensionAffinity: []string{"grim_trigger", "agreeableness", "k_level"},
		NodePool: []ScenarioNode{
			{NodeID: "the_draft", Text: "the draft you typed", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "what_you_respected", Text: "what you respected first", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "pile_already_forming", Text: "the pile already forming", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "one_strike", Text: "one strike and out", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "the_whole_person", Text: "the whole person", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "your_worst_sentence", Text: "your own worst sentence", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "who_sees_you_write", Text: "who sees what you write", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "closing_the_tab", Text: "closing the tab", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "the_principle", Text: "the principle at stake", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "openness": {Direction: "low"}}},
			{NodeID: "theyll_never_read", Text: "they'll never read it", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "k_level": {Direction: "high"}}},
			{NodeID: "forgiveness_price", Text: "what forgiveness costs", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "work_still_good", Text: "the work that's still good", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "discount_factor": {Direction: "low"}}},
		},
	},
	{
		ScenarioID:        "what_you_know_011",
		Type:              ScenarioMoral,
		Tier:              TierUniversal,
		Text:              "You know something that would change how someone you care about sees a situation they're in.",
		DimensionAffinity: []string{"agreeableness", "conscientiousness", "k_level"},
		NodePool: []ScenarioNode{
			{NodeID: "thing_youre_holding", Text: "the thing you're holding", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "their_peace", Text: "their peace right now", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "the_right_moment", Text: "the right moment", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "whose_story", Text: "whose story it is", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "day_after_they_know", Text: "the day after they know", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "k_level": {Direction: "high"}}},
			{NodeID: "if_it_were_you", Text: "if it were you", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "carrying_it_alone", Text: "carrying it alone", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "the_messenger", Text: "what happens to messengers", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_partial_version", Text: "the partial version", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "low"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "it_surfaces", Text: "it surfaces eventually", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "what_theyd_do", Text: "what they'd do with it", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "openness": {Direction: "high"}}},
			{NodeID: "why_you_know", Text: "why you know at all", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
		},
	},
	{
		ScenarioID:        "exit_available_012",
		Type:              ScenarioMoral,
		Tier:              TierUniversal,
		Text:              "The exit is available. Staying costs you something real.",
		DimensionAffinity: []string{"approach_avoidance", "discount_factor", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "door_unlocked", Text: "the door, unlocked", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "whats_owed", Text: "what's owed here", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "bill_for_staying", Text: "the bill for staying", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "who_is_left", Text: "who's left if you go", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "how_youd_tell_it", Text: "how you'd tell it later", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "years_already_in", Text: "the years already in", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "how_light", Text: "how light you'd feel", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "history_with_exits", Text: "your history with exits", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "staying_on_purpose", Text: "staying on purpose", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "cost_today", Text: "what it costs today", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "doors_that_lock", Text: "doors that lock behind you", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "asking_for_better", Text: "asking for better instead", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "agreeableness": {Direction: "low"}}},
		},
	},
	{
		ScenarioID:        "market_tuesday_013",
		Type:              ScenarioCultural,
		Tier:              TierUniversal,
		Text:              "The market crashes on a Tuesday. Everything you built over three years is liquid.",
		DimensionAffinity: []string{"neuroticism", "discount_factor", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "number_on_screen", Text: "the number on the screen", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_three_years", Text: "the three years themselves", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "the_sell_button", Text: "the sell button", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "holding_anyway", Text: "holding anyway", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "whose_fault", Text: "whose fault this is", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "plan_written_calm", Text: "the plan you wrote calm", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "everyone_elses_panic", Text: "everyone else's panic", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "agreeableness": {Direction: "low"}}},
			{NodeID: "starting_from_zero", Text: "starting from zero", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "what_money_was_for", Text: "what the money was for", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "k_level": {Direction: "high"}}},
			{NodeID: "tuition_just_paid", Text: "the tuition you just paid", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "openness": {Direction: "high"}}},
			{NodeID: "never_trusting_again", Text: "never trusting it again", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "what_isnt_liquid", Text: "what isn't liquid", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "discount_factor": {Direction: "low"}}},
		},
	},
	{
		ScenarioID:        "room_agrees_014",
		Type:              ScenarioCultural,
		Tier:              TierUniversal,
		Text:              "A room full of people agrees on something you believe is wrong. No one has asked your opinion.",
		DimensionAffinity: []string{"agreeableness", "approach_avoidance", "neuroticism"},
		NodePool: []ScenarioNode{
			{NodeID: "nod_you_could_give", Text: "the nod you could give", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "hand_you_could_raise", Text: "the hand you could raise", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "what_speaking_costs", Text: "what speaking costs here", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "chance_youre_wrong", Text: "the chance you're wrong", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "leaving_quietly", Text: "leaving quietly", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "agreeableness": {Direction: "low"}}},
			{NodeID: "conversation_after", Text: "the conversation after, one-on-one", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "being_on_record", Text: "being on record", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "who_else_doubts", Text: "who else isn't sure", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "words_you_swallow", Text: "the words you swallow", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "rooms_remember", Text: "rooms remember dissent", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "last_time_you_spoke", Text: "the last time you spoke up", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "it_passes_anyway", Text: "it passes anyway", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "discount_factor": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "faced_changed_015",
		Type:              ScenarioPhilosophical,
		Tier:              TierUniversal,
		Text:              "\"Not everything that is faced can be changed, but nothing can be changed until it is faced.\" — Baldwin",
		DimensionAffinity: []string{"openness", "approach_avoidance", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "thing_still_unfaced", Text: "the thing still unfaced", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "mirrors_version", Text: "the mirror's version", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "openness": {Direction: "high"}}},
			{NodeID: "what_cant_change", Text: "what can't be changed", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_first_look", Text: "the first look", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "giving_it_a_name", Text: "giving it a name", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "k_level": {Direction: "high"}}},
			{NodeID: "who_faced_theirs", Text: "someone who faced theirs", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "what_looking_costs", Text: "what looking costs", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "always_known", Text: "what you've always known", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "version_after", Text: "the version after", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "openness": {Direction: "high"}}},
			{NodeID: "how_slow_change_is", Text: "how slowly change moves", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "not_yet", Text: "not yet", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "is_the_line_true", Text: "whether the line is true", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "openness": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "the_thing_you_know_016",
		Type:              ScenarioMoral,
		Tier:              TierUniversal,
		Text:              "You know something that would change how someone you love sees a situation they're in.",
		DimensionAffinity: []string{"agreeableness", "approach_avoidance", "k_level"},
		NodePool: []ScenarioNode{
			{NodeID: "weight_of_knowing", Text: "the weight of knowing", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "what_stays_unsaid", Text: "what stays unsaid", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "their_version", Text: "their version of it", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "cost_of_telling", Text: "the cost of telling", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "who_it_protects", Text: "who the silence protects", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "agreeableness": {Direction: "low"}}},
			{NodeID: "the_clean_silence", Text: "the clean silence", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "neuroticism": {Direction: "low"}}},
			{NodeID: "after_you_speak", Text: "after you speak", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "grim_trigger": {Direction: "high"}}},
			{NodeID: "what_you_owe", Text: "what you owe them", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "your_own_comfort", Text: "your own comfort", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "the_kinder_lie", Text: "the kinder lie", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "openness": {Direction: "low"}}},
			{NodeID: "the_long_truth", Text: "the long truth", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "low"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "the_person_you_become", Text: "the person you become either way", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
		},
	},
	{
		ScenarioID:        "checkpoint_1989_017",
		Type:              ScenarioHistorical,
		Tier:              TierUniversal,
		Text:              "Berlin. November 9th, 1989. The wall is coming down. You're 24, standing at Checkpoint Charlie.",
		DimensionAffinity: []string{"approach_avoidance", "temporal_focus", "openness"},
		NodePool: []ScenarioNode{
			{NodeID: "first_step_through", Text: "the first step through", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "what_you_leave", Text: "what you leave behind", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "the_crowd_pull", Text: "the pull of the crowd", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_old_fear", Text: "the old fear", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "the_other_side", Text: "the other side", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "who_you_were", Text: "who you were yesterday", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "the_open_gate", Text: "the open gate", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "openness": {Direction: "high"}}},
			{NodeID: "the_quiet_after", Text: "the quiet after", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "low"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "the_weight_of_walls", Text: "the weight of walls", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "the_stranger_beside", Text: "the stranger beside you", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "the_road_west", Text: "the road west", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "whether_it_lasts", Text: "whether it lasts", PrimaryDimension: "k_level", DimensionSignals: map[string]NodeDimSignal{"k_level": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "market_tuesday_018",
		Type:              ScenarioCultural,
		Tier:              TierUniversal,
		Text:              "The market crashes on a Tuesday. Three years of what you built is liquid.",
		DimensionAffinity: []string{"grim_trigger", "discount_factor", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "number_on_screen", Text: "the number on the screen", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "what_it_was_for", Text: "what it was for", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "the_call_you_make", Text: "the call you make now", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "the_long_view", Text: "the long view", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "the_floor", Text: "the floor", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "approach_avoidance": {Direction: "low"}}},
			{NodeID: "who_you_tell", Text: "who you tell", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "the_restart", Text: "the restart", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "the_blame", Text: "where the blame lands", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "external"}, "grim_trigger": {Direction: "high"}}},
			{NodeID: "what_held", Text: "what held", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "the_steady_hand", Text: "the steady hand", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "low"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "the_next_three_years", Text: "the next three years", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "what_it_proved", Text: "what it proved about you", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "openness": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "not_being_yourself_019",
		Type:              ScenarioPhilosophical,
		Tier:              TierUniversal,
		Text:              "\"The most common form of despair is not being who you are.\" — Kierkegaard",
		DimensionAffinity: []string{"openness", "neuroticism", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "self_you_perform", Text: "the self you perform", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "low"}, "agreeableness": {Direction: "high"}}},
			{NodeID: "the_quiet_cost", Text: "the quiet cost", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "who_you_are_alone", Text: "who you are alone", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "the_mask_that_fits", Text: "the mask that fits too well", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "the_room_you_relax", Text: "the room you relax in", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "low"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "what_you_defend", Text: "what you defend hardest", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "the_unlived_version", Text: "the unlived version", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "openness": {Direction: "high"}}},
			{NodeID: "price_of_honesty", Text: "the price of honesty", PrimaryDimension: "approach_avoidance", DimensionSignals: map[string]NodeDimSignal{"approach_avoidance": {Direction: "high"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "the_familiar_shape", Text: "the familiar shape", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "openness": {Direction: "low"}}},
			{NodeID: "the_true_north", Text: "the true north", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "conscientiousness": {Direction: "high"}}},
			{NodeID: "the_audience", Text: "the audience", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "locus_of_control": {Direction: "external"}}},
			{NodeID: "the_return_to_self", Text: "the return to self", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
		},
	},
	{
		ScenarioID:        "you_let_it_end_020",
		Type:              ScenarioLoss,
		Tier:              TierUniversal,
		Text:              "Something you built ended. Not because it failed — because you let it.",
		DimensionAffinity: []string{"discount_factor", "temporal_focus", "locus_of_control"},
		NodePool: []ScenarioNode{
			{NodeID: "the_letting_go", Text: "the letting go", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "discount_factor": {Direction: "high"}}},
			{NodeID: "what_remained", Text: "what remained", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "discount_factor": {Direction: "low"}}},
			{NodeID: "the_relief", Text: "the lightness after", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "low"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "the_guilt", Text: "the part that argues back", PrimaryDimension: "neuroticism", DimensionSignals: map[string]NodeDimSignal{"neuroticism": {Direction: "high"}, "locus_of_control": {Direction: "internal"}}},
			{NodeID: "the_room_now_empty", Text: "the room now empty", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "past"}, "neuroticism": {Direction: "high"}}},
			{NodeID: "who_you_freed", Text: "who you freed", PrimaryDimension: "agreeableness", DimensionSignals: map[string]NodeDimSignal{"agreeableness": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "the_decision_itself", Text: "the decision itself", PrimaryDimension: "locus_of_control", DimensionSignals: map[string]NodeDimSignal{"locus_of_control": {Direction: "internal"}, "k_level": {Direction: "high"}}},
			{NodeID: "the_old_weight", Text: "the old weight", PrimaryDimension: "grim_trigger", DimensionSignals: map[string]NodeDimSignal{"grim_trigger": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "the_space_after", Text: "the space after", PrimaryDimension: "openness", DimensionSignals: map[string]NodeDimSignal{"openness": {Direction: "high"}, "temporal_focus": {Direction: "future"}}},
			{NodeID: "what_you_chose_instead", Text: "what you chose instead", PrimaryDimension: "discount_factor", DimensionSignals: map[string]NodeDimSignal{"discount_factor": {Direction: "high"}, "approach_avoidance": {Direction: "high"}}},
			{NodeID: "the_unfinished", Text: "the unfinished", PrimaryDimension: "conscientiousness", DimensionSignals: map[string]NodeDimSignal{"conscientiousness": {Direction: "high"}, "temporal_focus": {Direction: "past"}}},
			{NodeID: "the_open_road", Text: "the open road", PrimaryDimension: "temporal_focus", DimensionSignals: map[string]NodeDimSignal{"temporal_focus": {Direction: "future"}, "approach_avoidance": {Direction: "high"}}},
		},
	},
}

// scenarioIndex is built once for O(1) lookups.
var scenarioIndex = func() map[string]*Scenario {
	idx := make(map[string]*Scenario, len(Scenarios))
	for i := range Scenarios {
		idx[Scenarios[i].ScenarioID] = &Scenarios[i]
	}
	return idx
}()

// LookupScenario returns the scenario with the given ID.
func LookupScenario(scenarioID string) (*Scenario, bool) {
	s, ok := scenarioIndex[scenarioID]
	return s, ok
}

// LookupScenarioNode returns one node from a scenario's pool by ID.
// This is how the Analyst recovers dimension tags after the DynamoDB item
// has expired — node IDs are stable library IDs, unique within their pool.
func LookupScenarioNode(scenarioID, nodeID string) (*ScenarioNode, bool) {
	s, ok := scenarioIndex[scenarioID]
	if !ok {
		return nil, false
	}
	for i := range s.NodePool {
		if s.NodePool[i].NodeID == nodeID {
			return &s.NodePool[i], true
		}
	}
	return nil, false
}
