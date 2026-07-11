package signal

// CutItem is one obliquely-labelled thing in The Cut's field (features-horizon.md
// §5b/§5d — "Severance"). Temporal tags past/future/neutral things roughly evenly
// across the pool so a balanced nightly sample can read temporal_focus — the
// weakest-covered dimension in the current fragment set — through what a user
// sacrifices under a forced quota, not through a direct question.
type CutItem struct {
	ID                 string
	Text               string
	Temporal           string // "past" | "future" | "neutral"
	IntroducedAfterDay int
	Tier               string // TierEvergreen | TierCultural | TierCurrent
}

const (
	CutTemporalPast    = "past"
	CutTemporalFuture  = "future"
	CutTemporalNeutral = "neutral"
)

// CutItems is deliberately abstract — never a virtue word ("honesty", "family")
// a player could curate toward. Each phrase names a thing without saying whether
// keeping or cutting it is the "right" answer (§5e — the unsolvable game).
var CutItems = []CutItem{
	// --- past-tagged ---
	{ID: "cut_past_01", Text: "the version of you from last year", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_02", Text: "the apology you never got", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_03", Text: "who you were before this", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_04", Text: "the last time it was easy", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_05", Text: "the person you used to call first", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_06", Text: "the plan that fell through", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_07", Text: "what you almost said back then", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_08", Text: "the year you don't talk about", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_09", Text: "the friend you drifted from", Temporal: CutTemporalPast, Tier: TierEvergreen},
	{ID: "cut_past_10", Text: "the house you grew up leaving", Temporal: CutTemporalPast, Tier: TierEvergreen},

	// --- future-tagged ---
	{ID: "cut_future_01", Text: "the version of you not built yet", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_02", Text: "the day this gets easier", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_03", Text: "someone you haven't met yet", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_04", Text: "the apology you're waiting to give", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_05", Text: "the place you haven't gone", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_06", Text: "the year you'll finally rest", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_07", Text: "the thing you keep meaning to start", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_08", Text: "who you could be in five years", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_09", Text: "the risk you haven't taken", Temporal: CutTemporalFuture, Tier: TierEvergreen},
	{ID: "cut_future_10", Text: "the door you haven't opened", Temporal: CutTemporalFuture, Tier: TierEvergreen},

	// --- neutral-tagged (no temporal lean — structural/identity objects) ---
	{ID: "cut_neutral_01", Text: "the habit that keeps you safe", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_02", Text: "the story you tell about yourself", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_03", Text: "the thing you check first", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_04", Text: "the name you go by", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_05", Text: "the way you make decisions", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_06", Text: "the thing you protect without noticing", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_07", Text: "your first instinct", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_08", Text: "the rule you never break", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_09", Text: "what you reach for under pressure", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
	{ID: "cut_neutral_10", Text: "the thing that's always in the room", Temporal: CutTemporalNeutral, Tier: TierEvergreen},
}
