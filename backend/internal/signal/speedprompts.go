package signal

// SpeedOption is one selectable completion in a Speed Round prompt.
// DimensionSignals maps profile dimension names to the 0–1 signal recorded when
// this option is chosen (1 = high on that dimension). Keys match the
// profile_dimensions JSONB schema, same as Pair.DimensionSignals.
// An empty map is valid — the option is a neutral foil and contributes nothing.
type SpeedOption struct {
	Text             string
	DimensionSignals map[string]float64
}

// SpeedPrompt describes a Speed Round sentence starter with tagged completions.
// IntroducedAfterDay gates the prompt from deck sampling before the user has
// enough session history, mirroring Pair.IntroducedAfterDay.
type SpeedPrompt struct {
	PromptID           string
	Starter            string
	Options            []SpeedOption
	IntroducedAfterDay int
	Tier               string // TierEvergreen | TierCultural | TierCurrent
}

// SpeedPrompts is the Speed Round prompt library with behavioral dimension tags.
//
// The first eight entries mirror copy.onboarding.speedRoundPrompts in the
// frontend verbatim (starter and option text must stay in sync) so onboarding
// speed_round card_responses score into dimension signals too. The rest are
// deck-only prompts sampled by internal/services/deck.
var SpeedPrompts = []SpeedPrompt{

	// --- onboarding set (text mirrors frontend copy.onboarding.speedRoundPrompts) ---
	{
		PromptID: "wrong_default", Starter: "When things go wrong, I usually...",
		Options: []SpeedOption{
			{Text: "look inward", DimensionSignals: map[string]float64{"locus_of_control": 0.85, "neuroticism": 0.60}},
			{Text: "look outward", DimensionSignals: map[string]float64{"locus_of_control": 0.15}},
			{Text: "go quiet", DimensionSignals: map[string]float64{"neuroticism": 0.70, "approach_avoidance": 0.20}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},
	{
		PromptID: "most_myself", Starter: "I feel most like myself when I'm...",
		Options: []SpeedOption{
			{Text: "alone", DimensionSignals: map[string]float64{"approach_avoidance": 0.30}},
			{Text: "with people I trust", DimensionSignals: map[string]float64{"agreeableness": 0.75, "approach_avoidance": 0.60}},
			{Text: "doing something", DimensionSignals: map[string]float64{"conscientiousness": 0.70, "approach_avoidance": 0.75}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},
	{
		PromptID: "no_response", Starter: "When someone doesn't respond, I...",
		Options: []SpeedOption{
			{Text: "assume the worst", DimensionSignals: map[string]float64{"neuroticism": 0.85}},
			{Text: "forget about it", DimensionSignals: map[string]float64{"neuroticism": 0.15}},
			{Text: "reach out again", DimensionSignals: map[string]float64{"approach_avoidance": 0.80, "agreeableness": 0.60}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},
	{
		PromptID: "my_default", Starter: "My default is...",
		Options: []SpeedOption{
			{Text: "thinking too much", DimensionSignals: map[string]float64{"neuroticism": 0.70, "openness": 0.60}},
			{Text: "not thinking enough", DimensionSignals: map[string]float64{"discount_factor": 0.20, "conscientiousness": 0.30}},
			{Text: "somewhere between", DimensionSignals: map[string]float64{}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},
	{
		PromptID: "criticism", Starter: "Criticism makes me...",
		Options: []SpeedOption{
			{Text: "defensive", DimensionSignals: map[string]float64{"grim_trigger": 0.70, "agreeableness": 0.30}},
			{Text: "spiraling", DimensionSignals: map[string]float64{"neuroticism": 0.90}},
			{Text: "curious", DimensionSignals: map[string]float64{"openness": 0.80, "neuroticism": 0.10}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},
	{
		PromptID: "self_protect", Starter: "I protect myself by...",
		Options: []SpeedOption{
			{Text: "going quiet", DimensionSignals: map[string]float64{"approach_avoidance": 0.20}},
			{Text: "getting busy", DimensionSignals: map[string]float64{"conscientiousness": 0.65, "approach_avoidance": 0.55}},
			{Text: "deflecting with humor", DimensionSignals: map[string]float64{"agreeableness": 0.55, "openness": 0.60}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},
	{
		PromptID: "rest_feels", Starter: "Rest feels...",
		Options: []SpeedOption{
			{Text: "earned", DimensionSignals: map[string]float64{"conscientiousness": 0.80}},
			{Text: "guilty", DimensionSignals: map[string]float64{"neuroticism": 0.75, "conscientiousness": 0.70}},
			{Text: "necessary", DimensionSignals: map[string]float64{"conscientiousness": 0.45, "neuroticism": 0.30}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},
	{
		PromptID: "know_im_off", Starter: "I know I'm off when...",
		Options: []SpeedOption{
			{Text: "I stop noticing things", DimensionSignals: map[string]float64{"openness": 0.55}},
			{Text: "I become irritable", DimensionSignals: map[string]float64{"grim_trigger": 0.60, "neuroticism": 0.65}},
			{Text: "I withdraw", DimensionSignals: map[string]float64{"approach_avoidance": 0.20, "neuroticism": 0.60}},
		},
		IntroducedAfterDay: 0, Tier: TierEvergreen,
	},

	// --- deck-only prompts ---
	{
		PromptID: "plans_change", Starter: "Plans changing at the last minute makes me...",
		Options: []SpeedOption{
			{Text: "relieved", DimensionSignals: map[string]float64{"conscientiousness": 0.25}},
			{Text: "scrambled", DimensionSignals: map[string]float64{"neuroticism": 0.70, "conscientiousness": 0.60}},
			{Text: "indifferent", DimensionSignals: map[string]float64{"openness": 0.60, "neuroticism": 0.20}},
		},
		IntroducedAfterDay: 1, Tier: TierEvergreen,
	},
	{
		PromptID: "wanting", Starter: "When I want something, I...",
		Options: []SpeedOption{
			{Text: "go straight for it", DimensionSignals: map[string]float64{"approach_avoidance": 0.90}},
			{Text: "wait for the right moment", DimensionSignals: map[string]float64{"k_level": 0.70, "discount_factor": 0.80}},
			{Text: "talk myself out of it", DimensionSignals: map[string]float64{"approach_avoidance": 0.15, "neuroticism": 0.65}},
		},
		IntroducedAfterDay: 1, Tier: TierEvergreen,
	},
	{
		PromptID: "being_told", Starter: "Being told what to do makes me...",
		Options: []SpeedOption{
			{Text: "comply, then resent it", DimensionSignals: map[string]float64{"agreeableness": 0.60, "grim_trigger": 0.70}},
			{Text: "push back immediately", DimensionSignals: map[string]float64{"agreeableness": 0.20, "approach_avoidance": 0.80}},
			{Text: "fine, mostly", DimensionSignals: map[string]float64{"agreeableness": 0.70, "neuroticism": 0.25}},
		},
		IntroducedAfterDay: 2, Tier: TierEvergreen,
	},
	{
		PromptID: "the_past", Starter: "The past is...",
		Options: []SpeedOption{
			{Text: "always present", DimensionSignals: map[string]float64{"temporal_focus": 0.10, "neuroticism": 0.60}},
			{Text: "a reference", DimensionSignals: map[string]float64{"temporal_focus": 0.50, "openness": 0.55}},
			{Text: "gone", DimensionSignals: map[string]float64{"temporal_focus": 0.90}},
		},
		IntroducedAfterDay: 2, Tier: TierEvergreen,
	},
	{
		PromptID: "hard_conversation", Starter: "Before a hard conversation, I...",
		Options: []SpeedOption{
			{Text: "script every line", DimensionSignals: map[string]float64{"k_level": 0.80, "neuroticism": 0.70}},
			{Text: "wing it", DimensionSignals: map[string]float64{"discount_factor": 0.25, "approach_avoidance": 0.70}},
			{Text: "postpone it", DimensionSignals: map[string]float64{"approach_avoidance": 0.15}},
		},
		IntroducedAfterDay: 3, Tier: TierEvergreen,
	},
	{
		PromptID: "crossed", Starter: "When someone crosses me, I...",
		Options: []SpeedOption{
			{Text: "keep score quietly", DimensionSignals: map[string]float64{"grim_trigger": 0.85, "k_level": 0.70}},
			{Text: "say it once, then move on", DimensionSignals: map[string]float64{"grim_trigger": 0.30, "approach_avoidance": 0.70}},
			{Text: "pretend it didn't land", DimensionSignals: map[string]float64{"agreeableness": 0.65, "neuroticism": 0.60}},
		},
		IntroducedAfterDay: 3, Tier: TierEvergreen,
	},
	{
		PromptID: "free_afternoon", Starter: "A free afternoon is for...",
		Options: []SpeedOption{
			{Text: "catching up", DimensionSignals: map[string]float64{"conscientiousness": 0.80, "temporal_focus": 0.40}},
			{Text: "whatever happens", DimensionSignals: map[string]float64{"openness": 0.70, "discount_factor": 0.30}},
			{Text: "recovering", DimensionSignals: map[string]float64{"neuroticism": 0.60}},
		},
		IntroducedAfterDay: 4, Tier: TierEvergreen,
	},
	{
		PromptID: "trust_people", Starter: "I trust people...",
		Options: []SpeedOption{
			{Text: "until they prove otherwise", DimensionSignals: map[string]float64{"agreeableness": 0.80, "grim_trigger": 0.60}},
			{Text: "after they earn it", DimensionSignals: map[string]float64{"grim_trigger": 0.70, "k_level": 0.60}},
			{Text: "in pieces", DimensionSignals: map[string]float64{"k_level": 0.75, "agreeableness": 0.40}},
		},
		IntroducedAfterDay: 5, Tier: TierEvergreen,
	},
	{
		PromptID: "tomorrow_is", Starter: "Tomorrow is...",
		Options: []SpeedOption{
			{Text: "already scheduled", DimensionSignals: map[string]float64{"conscientiousness": 0.85, "temporal_focus": 0.75}},
			{Text: "a fresh start", DimensionSignals: map[string]float64{"temporal_focus": 0.80, "openness": 0.60}},
			{Text: "today's problem later", DimensionSignals: map[string]float64{"discount_factor": 0.20, "temporal_focus": 0.45}},
		},
		IntroducedAfterDay: 5, Tier: TierEvergreen,
	},
	{
		PromptID: "winning", Starter: "When I win, I...",
		Options: []SpeedOption{
			{Text: "minimize it", DimensionSignals: map[string]float64{"neuroticism": 0.60, "agreeableness": 0.60}},
			{Text: "plan the next one", DimensionSignals: map[string]float64{"conscientiousness": 0.70, "temporal_focus": 0.80}},
			{Text: "enjoy it loudly", DimensionSignals: map[string]float64{"approach_avoidance": 0.85, "neuroticism": 0.20}},
		},
		IntroducedAfterDay: 7, Tier: TierEvergreen,
	},
	{
		PromptID: "the_silence", Starter: "Silence usually means...",
		Options: []SpeedOption{
			{Text: "something's wrong", DimensionSignals: map[string]float64{"neuroticism": 0.80, "approach_avoidance": 0.30}},
			{Text: "nothing at all", DimensionSignals: map[string]float64{"neuroticism": 0.20}},
			{Text: "space to think", DimensionSignals: map[string]float64{"openness": 0.65, "approach_avoidance": 0.35}},
		},
		IntroducedAfterDay: 3, Tier: TierEvergreen,
	},
	{
		PromptID: "the_rules", Starter: "Rules are...",
		Options: []SpeedOption{
			{Text: "there for a reason", DimensionSignals: map[string]float64{"conscientiousness": 0.80, "agreeableness": 0.60}},
			{Text: "a starting point", DimensionSignals: map[string]float64{"openness": 0.75, "agreeableness": 0.35}},
			{Text: "for other people", DimensionSignals: map[string]float64{"agreeableness": 0.15, "locus_of_control": 0.80}},
		},
		IntroducedAfterDay: 4, Tier: TierEvergreen,
	},
	{
		PromptID: "i_remember", Starter: "I mostly remember...",
		Options: []SpeedOption{
			{Text: "what people did", DimensionSignals: map[string]float64{"grim_trigger": 0.80, "temporal_focus": 0.25}},
			{Text: "how it felt", DimensionSignals: map[string]float64{"neuroticism": 0.65, "temporal_focus": 0.30}},
			{Text: "what's next", DimensionSignals: map[string]float64{"temporal_focus": 0.85, "discount_factor": 0.70}},
		},
		IntroducedAfterDay: 6, Tier: TierEvergreen,
	},
	{
		PromptID: "asking_for_help", Starter: "Asking for help feels...",
		Options: []SpeedOption{
			{Text: "like losing", DimensionSignals: map[string]float64{"locus_of_control": 0.80, "approach_avoidance": 0.30}},
			{Text: "normal", DimensionSignals: map[string]float64{"agreeableness": 0.70, "neuroticism": 0.25}},
			{Text: "easier than it should", DimensionSignals: map[string]float64{"approach_avoidance": 0.70, "agreeableness": 0.65}},
		},
		IntroducedAfterDay: 5, Tier: TierEvergreen,
	},
	{
		PromptID: "the_unknown", Starter: "Not knowing what's next is...",
		Options: []SpeedOption{
			{Text: "exciting", DimensionSignals: map[string]float64{"openness": 0.80, "approach_avoidance": 0.80}},
			{Text: "unbearable", DimensionSignals: map[string]float64{"neuroticism": 0.85, "conscientiousness": 0.65}},
			{Text: "just how it is", DimensionSignals: map[string]float64{"neuroticism": 0.25}},
		},
		IntroducedAfterDay: 6, Tier: TierEvergreen,
	},
	{
		PromptID: "letting_go", Starter: "I let go of things...",
		Options: []SpeedOption{
			{Text: "long after I should", DimensionSignals: map[string]float64{"temporal_focus": 0.15, "discount_factor": 0.25}},
			{Text: "the moment they end", DimensionSignals: map[string]float64{"temporal_focus": 0.80, "grim_trigger": 0.20}},
			{Text: "before they're over", DimensionSignals: map[string]float64{"approach_avoidance": 0.30, "discount_factor": 0.60}},
		},
		IntroducedAfterDay: 7, Tier: TierEvergreen,
	},
	{
		PromptID: "a_promise", Starter: "A promise is...",
		Options: []SpeedOption{
			{Text: "binding", DimensionSignals: map[string]float64{"conscientiousness": 0.85, "grim_trigger": 0.70}},
			{Text: "an intention", DimensionSignals: map[string]float64{"agreeableness": 0.55, "discount_factor": 0.40}},
			{Text: "only as good as today", DimensionSignals: map[string]float64{"discount_factor": 0.20, "temporal_focus": 0.45}},
		},
		IntroducedAfterDay: 5, Tier: TierEvergreen,
	},
}

// LookupSpeedOption returns the tagged option for a starter + chosen text pair,
// and whether it was found. Used by the Analyst context assembly to score
// speed_round card_responses; unknown starters (stale clients, removed prompts)
// simply contribute no signal.
func LookupSpeedOption(starter, chosen string) (SpeedOption, bool) {
	for _, p := range SpeedPrompts {
		if p.Starter != starter {
			continue
		}
		for _, o := range p.Options {
			if o.Text == chosen {
				return o, true
			}
		}
		return SpeedOption{}, false
	}
	return SpeedOption{}, false
}
