package signal

// Word describes a reaction test word tagged for behavioral dimension computation.
// Approach: true = approach-motivated (moving toward reward); false = avoidance (moving away from threat).
// Abstract: true = abstract/conceptual; false = concrete/specific.
//
// Fast taps on avoidance words (rejection, abandonment, failure, shame, loss) → avoidance signal.
// Fast taps on approach words (achievement, success, belonging, pride, purpose) → approach signal.
// Abstract words load on openness; concrete words load on conscientiousness via the action/object distinction.
type Word struct {
	Text     string
	Approach bool
	Abstract bool
}

// Words is the complete reaction word library with behavioral dimension tags.
// Covers all words used across archetype and explore word sets in deck/generator.go.
var Words = []Word{
	// threat / loss cluster (avoidance, abstract)
	{Text: "abandonment", Approach: false, Abstract: true},
	{Text: "absence", Approach: false, Abstract: true},
	{Text: "anger", Approach: false, Abstract: true},
	{Text: "constraint", Approach: false, Abstract: true},
	{Text: "distance", Approach: false, Abstract: true},
	{Text: "doubt", Approach: false, Abstract: true},
	{Text: "failure", Approach: false, Abstract: true},
	{Text: "grief", Approach: false, Abstract: true},
	{Text: "inadequacy", Approach: false, Abstract: true},
	{Text: "loss", Approach: false, Abstract: true},
	{Text: "rejection", Approach: false, Abstract: true},
	{Text: "resistance", Approach: false, Abstract: true},
	{Text: "shame", Approach: false, Abstract: true},
	{Text: "silence", Approach: false, Abstract: true},
	{Text: "surrender", Approach: false, Abstract: true},

	// authority signals threat-of-constraint rather than reward in this behavioral context
	{Text: "authority", Approach: false, Abstract: true},

	// reward / connection cluster (approach, abstract)
	{Text: "approval", Approach: true, Abstract: true},
	{Text: "belonging", Approach: true, Abstract: true},
	{Text: "boundaries", Approach: true, Abstract: true},
	{Text: "certainty", Approach: true, Abstract: true},
	{Text: "change", Approach: true, Abstract: true},
	{Text: "clarity", Approach: true, Abstract: true},
	{Text: "connection", Approach: true, Abstract: true},
	{Text: "continuity", Approach: true, Abstract: true},
	{Text: "control", Approach: true, Abstract: true},
	{Text: "freedom", Approach: true, Abstract: true},
	{Text: "identity", Approach: true, Abstract: true},
	{Text: "joy", Approach: true, Abstract: true},
	{Text: "loyalty", Approach: true, Abstract: true},
	{Text: "memory", Approach: true, Abstract: true},
	{Text: "power", Approach: true, Abstract: true},
	{Text: "presence", Approach: true, Abstract: true},
	{Text: "pride", Approach: true, Abstract: true},
	{Text: "purpose", Approach: true, Abstract: true},
	{Text: "risk", Approach: true, Abstract: true},
	{Text: "safety", Approach: true, Abstract: true},
	{Text: "truth", Approach: true, Abstract: true},
	{Text: "trust", Approach: true, Abstract: true},
	{Text: "visibility", Approach: true, Abstract: true},
	{Text: "voice", Approach: true, Abstract: true},
	{Text: "warmth", Approach: true, Abstract: true},
	{Text: "worth", Approach: true, Abstract: true},

	// approach, concrete (outcome/action words — load on conscientiousness)
	{Text: "achievement", Approach: true, Abstract: false},
	{Text: "comfort", Approach: true, Abstract: false},
	{Text: "effort", Approach: true, Abstract: false},
	{Text: "rest", Approach: true, Abstract: false},
	{Text: "stability", Approach: true, Abstract: false},
	{Text: "success", Approach: true, Abstract: false},
}

// Lookup returns the Word entry for the given text, and whether it was found.
// Used by the Analyst context assembly to tag card_response words.
func Lookup(text string) (Word, bool) {
	for _, w := range Words {
		if w.Text == text {
			return w, true
		}
	}
	return Word{}, false
}
