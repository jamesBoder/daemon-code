package signal

// Word describes a reaction test word tagged for behavioral dimension computation.
// Approach: true = approach-motivated (moving toward reward); false = avoidance (moving away from threat).
// Abstract: true = abstract/conceptual; false = concrete/specific.
// CoreFor lists the archetypes this word probes directly; the deck generator
// samples an archetype's primary reaction test from its core words and the
// explore test from everything else.
//
// Fast taps on avoidance words (rejection, abandonment, failure, shame, loss) → avoidance signal.
// Fast taps on approach words (achievement, success, belonging, pride, purpose) → approach signal.
// Abstract words load on openness; concrete words load on conscientiousness via the action/object distinction.
type Word struct {
	Text     string
	Approach bool
	Abstract bool
	CoreFor  []string
}

// Words is the complete reaction word library with behavioral dimension tags.
// The deck generator samples nightly word sets from this library; every word
// here is scoreable by the Analyst's dimension computation.
var Words = []Word{
	// threat / loss cluster (avoidance, abstract)
	{Text: "abandonment", Approach: false, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "absence", Approach: false, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "anger", Approach: false, Abstract: true},
	{Text: "comparison", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "constraint", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "distance", Approach: false, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "departure", Approach: false, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "doubt", Approach: false, Abstract: true, CoreFor: []string{"default"}},
	{Text: "emptiness", Approach: false, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "failure", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "grief", Approach: false, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "inadequacy", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "invisibility", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "loneliness", Approach: false, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "loss", Approach: false, Abstract: true, CoreFor: []string{"grief_carrier", "default"}},
	{Text: "mourning", Approach: false, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "obedience", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "perfection", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "pressure", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "rejection", Approach: false, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "resistance", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "shame", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "silence", Approach: false, Abstract: true},
	{Text: "suppression", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "surrender", Approach: false, Abstract: true},

	// authority signals threat-of-constraint rather than reward in this behavioral context
	{Text: "authority", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},

	// reward / connection cluster (approach, abstract)
	{Text: "approval", Approach: true, Abstract: true},
	{Text: "attachment", Approach: true, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "belonging", Approach: true, Abstract: true, CoreFor: []string{"abandoned_child", "default"}},
	{Text: "boundaries", Approach: true, Abstract: true},
	{Text: "defiance", Approach: true, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "certainty", Approach: true, Abstract: true},
	{Text: "change", Approach: true, Abstract: true},
	{Text: "clarity", Approach: true, Abstract: true, CoreFor: []string{"default"}},
	{Text: "connection", Approach: true, Abstract: true},
	{Text: "continuity", Approach: true, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "control", Approach: true, Abstract: true, CoreFor: []string{"caged_rage", "default"}},
	{Text: "freedom", Approach: true, Abstract: true, CoreFor: []string{"caged_rage", "default"}},
	{Text: "identity", Approach: true, Abstract: true},
	{Text: "joy", Approach: true, Abstract: true},
	{Text: "loyalty", Approach: true, Abstract: true},
	{Text: "memory", Approach: true, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "power", Approach: true, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "presence", Approach: true, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "pride", Approach: true, Abstract: true},
	{Text: "purpose", Approach: true, Abstract: true, CoreFor: []string{"default"}},
	{Text: "reassurance", Approach: true, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "remembrance", Approach: true, Abstract: true, CoreFor: []string{"grief_carrier"}},
	{Text: "risk", Approach: true, Abstract: true},
	{Text: "safety", Approach: true, Abstract: true, CoreFor: []string{"abandoned_child", "default"}},
	{Text: "truth", Approach: true, Abstract: true},
	{Text: "trust", Approach: true, Abstract: true, CoreFor: []string{"default"}},
	{Text: "validation", Approach: true, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "visibility", Approach: true, Abstract: true},
	{Text: "voice", Approach: true, Abstract: true},
	{Text: "warmth", Approach: true, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "worth", Approach: true, Abstract: true, CoreFor: []string{"unworthy_self"}},

	// approach, concrete (outcome/action words — load on conscientiousness)
	{Text: "achievement", Approach: true, Abstract: false, CoreFor: []string{"unworthy_self", "default"}},
	{Text: "comfort", Approach: true, Abstract: false},
	{Text: "effort", Approach: true, Abstract: false},
	{Text: "keepsake", Approach: true, Abstract: false, CoreFor: []string{"grief_carrier"}},
	{Text: "rest", Approach: true, Abstract: false},
	{Text: "stability", Approach: true, Abstract: false},
	{Text: "success", Approach: true, Abstract: false, CoreFor: []string{"unworthy_self"}},

	// --- expansion batch ---
	// threat / loss cluster (avoidance, abstract)
	{Text: "betrayal", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "regret", Approach: false, Abstract: true, CoreFor: []string{"grief_carrier", "default"}},
	{Text: "exposure", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "dependence", Approach: false, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "futility", Approach: false, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "humiliation", Approach: false, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "neglect", Approach: false, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "powerlessness", Approach: false, Abstract: true, CoreFor: []string{"caged_rage", "default"}},
	// threat / loss cluster (avoidance, concrete)
	{Text: "wound", Approach: false, Abstract: false, CoreFor: []string{"grief_carrier"}},
	{Text: "debt", Approach: false, Abstract: false, CoreFor: []string{"unworthy_self"}},
	{Text: "wall", Approach: false, Abstract: false, CoreFor: []string{"caged_rage"}},
	// reward / connection cluster (approach, abstract)
	{Text: "recognition", Approach: true, Abstract: true, CoreFor: []string{"unworthy_self"}},
	{Text: "release", Approach: true, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "meaning", Approach: true, Abstract: true, CoreFor: []string{"default"}},
	{Text: "devotion", Approach: true, Abstract: true, CoreFor: []string{"abandoned_child"}},
	{Text: "vindication", Approach: true, Abstract: true, CoreFor: []string{"caged_rage"}},
	{Text: "closeness", Approach: true, Abstract: true, CoreFor: []string{"abandoned_child"}},
	// reward / connection cluster (approach, concrete)
	{Text: "anchor", Approach: true, Abstract: false, CoreFor: []string{"grief_carrier"}},
	{Text: "home", Approach: true, Abstract: false, CoreFor: []string{"abandoned_child"}},
	{Text: "craft", Approach: true, Abstract: false},
	{Text: "victory", Approach: true, Abstract: false, CoreFor: []string{"caged_rage"}},
}

// CoreWords returns the words tagged core for the archetype, falling back to
// the "default" pool when the archetype has no tagged words.
func CoreWords(archetype string) []Word {
	core := coreWordsFor(archetype)
	if len(core) == 0 {
		core = coreWordsFor("default")
	}
	return core
}

func coreWordsFor(archetype string) []Word {
	var core []Word
	for _, w := range Words {
		for _, a := range w.CoreFor {
			if a == archetype {
				core = append(core, w)
				break
			}
		}
	}
	return core
}

// ExploreWords returns the library minus the archetype's core pool — the
// broader set the second nightly reaction test samples to surface signals
// beyond the primary archetype. Disjoint from CoreWords for the same
// archetype, so the two tests never overlap within one deck.
func ExploreWords(archetype string) []Word {
	core := make(map[string]bool)
	for _, w := range CoreWords(archetype) {
		core[w.Text] = true
	}
	var explore []Word
	for _, w := range Words {
		if !core[w.Text] {
			explore = append(explore, w)
		}
	}
	return explore
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
