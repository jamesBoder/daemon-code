package deck

import (
	"context"
	"encoding/json"
	"math/rand"

	"github.com/google/uuid"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/signal"
)

// The Odd One Out — five of the user's own past Weighted Scale answers, four
// leaning the same way on a shared dimension and one leaning the opposite
// way. Pick the one that doesn't belong. Reads self-pattern recognition: does
// the user recognize their own established lean, or does the consistent
// version of themselves read as a stranger? Part of the format-variety
// backlog (docs/features-horizon.md §5) resumed 2026-09-23 -- flagged
// "build first, self-contained" in the original design since it needs no new
// data dependency beyond response history the app already has.
//
// Like buildPulse, this one isn't pure/synchronous -- it needs a DB read
// (the user's own response history), unlike Trap/Hold/Split/Cut which build
// from static content pools alone. g.q is nil-checked rather than wrapped in
// an injectable interface, matching buildPulse's own g.pulseGen-nil pattern:
// "dependency unavailable" is treated as "beat unavailable" for that night,
// not a panic, so every existing test's zero-value &Generator{} is
// unaffected without needing a fake DB implementation wired in.
//
// response_data isn't self-sufficient the way most fragments are: Weighted
// Scale's own response_data stores {left, right, value} but not pair_id, so
// recovering which dimension (and which side is "high") a past response
// spoke to means matching its (left, right) text back against the static
// signal.Pairs library via the existing signal.LookupPair -- the same
// lookup the Analyst's own context assembly already uses for this exact
// purpose. Best-effort: a pair whose text later changed in the library, or
// was retired, is silently skipped as a candidate (mirrors
// pickCutItems/pickScalePairs's "a miss just narrows the pool" philosophy).
const (
	oddOneOutMinCompiles    = 12   // needs real response history to exist at all
	oddOneOutOdds           = 4    // 1-in-4 once eligible, matching the other special beats
	oddOneOutHistoryLimit   = 150  // how far back to look for candidate responses
	oddOneOutLeanThreshold  = 0.35 // |value| must exceed this to count as a confident lean, not a near-center hedge
	oddOneOutMinorityNeeded = 1    // at least this many on the minority side
	oddOneOutMajorityNeeded = 4    // at least this many on the majority side
)

// weightedScaleResponse mirrors the frontend's WeightedScaleResult shape
// (frontend/src/components/minigames/WeightedScale.tsx) as stored verbatim
// in card_responses.response_data. Always an array in practice (the real
// deck only ever builds one pair per fragment), but decoded as one to match
// what's actually on the wire.
type weightedScaleResponse struct {
	Left  string  `json:"left"`
	Right string  `json:"right"`
	Value float64 `json:"value"`
}

// recentResponseFetcher is the one *db.Queries method buildOddOneOut needs.
// A small interface rather than depending on g.q directly so tests can
// inject a fake response history — see Generator.oddOneOutHistory.
type recentResponseFetcher interface {
	GetRecentResponsesByType(ctx context.Context, arg db.GetRecentResponsesByTypeParams) ([]db.CardResponse, error)
}

func (g *Generator) buildOddOneOut(ctx context.Context, userID uuid.UUID) (dynamo.Fragment, bool) {
	if g.oddOneOutHistory == nil {
		return dynamo.Fragment{}, false
	}

	responses, err := g.oddOneOutHistory.GetRecentResponsesByType(ctx, db.GetRecentResponsesByTypeParams{
		UserID:       userID,
		FragmentType: "weighted_scale",
		Limit:        oddOneOutHistoryLimit,
	})
	if err != nil || len(responses) == 0 {
		return dynamo.Fragment{}, false
	}

	// Bucket every confident-lean historical response by dimension + which
	// side it leans, deduping identical quotes (the same pair answered the
	// same way twice shouldn't crowd out real variety).
	byDim := map[string]map[bool]map[string]bool{} // dim -> high/low -> quote text -> seen
	for _, r := range responses {
		var results []weightedScaleResponse
		if json.Unmarshal(r.ResponseData, &results) != nil {
			continue
		}
		for _, res := range results {
			if res.Value > -oddOneOutLeanThreshold && res.Value < oddOneOutLeanThreshold {
				continue // too close to center to read as a confident lean
			}
			pair, ok := signal.LookupPair(res.Left, res.Right)
			if !ok {
				continue // pair text no longer in the library — skip, don't guess
			}
			leanedRight := res.Value > 0
			quote := res.Left
			if leanedRight {
				quote = res.Right
			}
			for dim, ds := range pair.DimensionSignals {
				high := leanedRight != ds.LeftHigh // leaned-right AND right-is-high, or leaned-left AND left-is-high
				if byDim[dim] == nil {
					byDim[dim] = map[bool]map[string]bool{true: {}, false: {}}
				}
				byDim[dim][high][quote] = true
			}
		}
	}

	// Collect every dimension with enough on both sides to actually pose the
	// question, then pick one at random -- no dimension is prioritized over
	// another here (v1); a future pass could bias toward the user's
	// currently lowest-confidence dimension instead.
	type eligibleDim struct {
		name         string
		majority     []string
		majorityHigh bool
		minority     []string
	}
	var eligible []eligibleDim
	for dim, sides := range byDim {
		high := mapKeys(sides[true])
		low := mapKeys(sides[false])
		switch {
		case len(high) >= oddOneOutMajorityNeeded && len(low) >= oddOneOutMinorityNeeded:
			eligible = append(eligible, eligibleDim{dim, high, true, low})
		case len(low) >= oddOneOutMajorityNeeded && len(high) >= oddOneOutMinorityNeeded:
			eligible = append(eligible, eligibleDim{dim, low, false, high})
		}
	}
	if len(eligible) == 0 {
		return dynamo.Fragment{}, false
	}
	chosen := eligible[rand.Intn(len(eligible))] // #nosec G404 — non-crypto content pick

	shuffleStrings(chosen.majority)
	shuffleStrings(chosen.minority)
	quotes := append(append([]string{}, chosen.majority[:oddOneOutMajorityNeeded]...), chosen.minority[0])

	type quoteItem struct {
		ID   string `json:"id"`
		Text string `json:"text"`
	}
	items := make([]quoteItem, len(quotes))
	for i, q := range quotes {
		items[i] = quoteItem{ID: uuid.New().String(), Text: q}
	}
	outlierID := items[len(items)-1].ID                                                  // the minority quote, appended last before shuffling ids' positions
	rand.Shuffle(len(items), func(i, j int) { items[i], items[j] = items[j], items[i] }) // #nosec G404 — non-crypto display order

	payload, _ := json.Marshal(map[string]interface{}{
		"type": "odd_one_out",
		// The frontend registry entry doesn't need to read this (only
		// quotes+outlier_id drive the UI), but it stays in the stored fragment
		// payload so a future computeOddOneOutSignals can recover which
		// dimension this beat tested without re-deriving it from quote text.
		"dimension":  chosen.name,
		"quotes":     items,
		"outlier_id": outlierID,
	})
	return dynamo.Fragment{
		ID:      uuid.New().String(),
		Type:    "odd_one_out",
		Payload: string(payload),
	}, true
}

func mapKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func shuffleStrings(s []string) {
	rand.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] }) // #nosec G404 — non-crypto content pick
}
