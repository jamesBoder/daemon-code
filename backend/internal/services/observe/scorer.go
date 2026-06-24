// Package observe applies the daemon's cheap, deterministic layer at session end:
// real in-session process movement and an immediate spoken line, computed in Go
// from the same dimension signals the nightly Analyst uses — no Anthropic call,
// no latency. The nightly Analyst remains the source of truth and reconciles the
// provisional live drift (see UpdatePattern resetting live_delta).
package observe

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/services/ai"
	"github.com/jamesboder/daemon-code/internal/signal"
)

// Tuning — every live-scoring threshold and bound lives here, never inline.
// Caps are fixed; the values applied within them are derived from signal strength.
const (
	liveNeutral        = 0.5  // dimension midpoint; computed signals are 0.0..1.0
	liveSignalMargin   = 0.10 // distance past neutral required to count as reinforcement
	liveMinSamples     = 2    // observations backing a dimension before it can move a bar
	maxPerSessionDelta = 4    // most one session can add to a single pattern
	maxWindowDelta     = 12   // ceiling on live_delta between nightly compiles

	// Patient seeding — presence is immediate (the daemon line), but a process is
	// only born after a dimension has held across several sessions of real signal.
	seedMinSessions       = 3    // sessions before the daemon will form its first process
	seedWhileUnderPattern = 3    // only seed while the user has fewer than this many patterns
	seedMinSamples        = 3    // stronger backing to birth a pattern than to move one
	seedMinMagnitude      = 0.30 // dimension must sit clearly off-neutral to seed
	seedStrengthMin       = 8    // derived starting-strength band for a seeded pattern
	seedStrengthMax       = 20

	establishedSessions = 4 // at/after this many sessions a quiet night reads as "watching", not new-user patience
)

// Move is one pattern's live, in-session change. The JSON shape mirrors the
// nightly processDiff so the frontend reuses its diff-card / change-chip render.
type Move struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Change string `json:"change"` // "strength_up"
	Delta  *int   `json:"delta,omitempty"`
}

// Result is the live read returned to the session-complete handler.
type Result struct {
	Diff       []Move `json:"diff"`
	DaemonLine string `json:"daemon_line"`
}

// Scorer applies deterministic, zero-cost process movement at session end.
type Scorer struct {
	q *db.Queries
}

func NewScorer(q *db.Queries) *Scorer { return &Scorer{q: q} }

// Score reads today's responses, moves the bars of any process whose dimensional
// fingerprint the user reinforced, optionally seeds one "still forming" process,
// and returns the moves plus a varied daemon line.
func (s *Scorer) Score(ctx context.Context, userID uuid.UUID) (Result, error) {
	today := pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}

	responses, err := s.q.GetResponsesForDate(ctx, db.GetResponsesForDateParams{UserID: userID, SessionDate: today})
	if err != nil {
		return Result{}, fmt.Errorf("get responses: %w", err)
	}
	signals := indexSignals(ai.SessionDimensionSignals(responses))

	patterns, err := s.q.GetPatternLibrary(ctx, userID)
	if err != nil {
		return Result{}, fmt.Errorf("get patterns: %w", err)
	}

	sessionDates, err := s.q.GetSessionDates(ctx, userID)
	if err != nil {
		return Result{}, fmt.Errorf("get session dates: %w", err)
	}
	sessionCount := len(sessionDates)

	moves, err := s.applyMoves(ctx, patterns, signals, today)
	if err != nil {
		return Result{}, err
	}

	seeded, err := s.maybeSeed(ctx, userID, patterns, signals, sessionCount, today)
	if err != nil {
		return Result{}, err
	}

	return Result{Diff: moves, DaemonLine: composeLine(moves, seeded, sessionCount)}, nil
}

// applyMoves nudges the live_delta of every existing pattern reinforced today.
func (s *Scorer) applyMoves(ctx context.Context, patterns []db.PatternLibrary, signals map[string]ai.SessionSignal, today pgtype.Date) ([]Move, error) {
	var moves []Move
	for _, p := range patterns {
		dim, dir, ok := parseSignalKey(p.SignalKey)
		if !ok {
			continue
		}
		sig, ok := signals[dim]
		if !ok || sig.N < liveMinSamples {
			continue
		}
		mag, ok := reinforcement(dir, sig.Signal)
		if !ok {
			continue
		}
		room := maxWindowDelta - int(p.LiveDelta)
		if room <= 0 {
			continue // already at the window ceiling
		}
		delta := deriveDelta(mag)
		if delta > room {
			delta = room
		}
		if err := s.q.ApplyLiveDelta(ctx, db.ApplyLiveDeltaParams{
			ID:          p.ID,
			LiveDelta:   int32(delta), // #nosec G115 — bounded by maxPerSessionDelta
			LiveDelta_2: maxWindowDelta,
			LastSeen:    today,
		}); err != nil {
			return moves, fmt.Errorf("apply live delta: %w", err)
		}
		// Only named patterns surface; an unnamed forming pattern moves quietly,
		// matching the nightly diff's "no blank-name cards" rule.
		if !p.Unnamed && p.Name.Valid {
			d := delta
			moves = append(moves, Move{ID: p.ID.String(), Name: p.Name.String, Change: "strength_up", Delta: &d})
		}
	}
	return moves, nil
}

// maybeSeed births at most one "still forming" unnamed process — only for a
// sparse user, only after enough sessions, only from a clearly-held dimension.
func (s *Scorer) maybeSeed(ctx context.Context, userID uuid.UUID, patterns []db.PatternLibrary, signals map[string]ai.SessionSignal, sessionCount int, today pgtype.Date) (bool, error) {
	if len(patterns) >= seedWhileUnderPattern || sessionCount < seedMinSessions {
		return false, nil
	}

	taken := make(map[string]bool, len(patterns))
	for _, p := range patterns {
		if dim, _, ok := parseSignalKey(p.SignalKey); ok {
			taken[dim] = true
		}
	}

	bestDim, bestDir, bestMag := "", "", 0.0
	for dim, sig := range signals {
		if taken[dim] || sig.N < seedMinSamples {
			continue
		}
		dir := directionOf(sig.Signal)
		mag, ok := reinforcement(dir, sig.Signal)
		if !ok || mag < seedMinMagnitude || mag <= bestMag {
			continue
		}
		bestDim, bestDir, bestMag = dim, dir, mag
	}
	if bestDim == "" {
		return false, nil
	}

	if _, err := s.q.InsertProvisionalPattern(ctx, db.InsertProvisionalPatternParams{
		UserID:        userID,
		Strength:      deriveSeedStrength(bestMag),
		FirstDetected: today,
		SignalKey:     bestDim + ":" + bestDir,
	}); err != nil {
		return false, fmt.Errorf("seed provisional pattern: %w", err)
	}
	return true, nil
}

func indexSignals(sigs []ai.SessionSignal) map[string]ai.SessionSignal {
	m := make(map[string]ai.SessionSignal, len(sigs))
	for _, sig := range sigs {
		m[sig.Dimension] = sig
	}
	return m
}

// parseSignalKey splits a "dimension:high|low" fingerprint.
func parseSignalKey(key string) (dim, dir string, ok bool) {
	parts := strings.SplitN(key, ":", 2)
	if len(parts) != 2 || parts[0] == "" {
		return "", "", false
	}
	if parts[1] != "high" && parts[1] != "low" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func directionOf(sig float64) string {
	if sig >= liveNeutral {
		return "high"
	}
	return "low"
}

// reinforcement reports whether today's signal moved in the keyed direction past
// the noise margin, and the normalized magnitude (0.0..1.0) of that move.
func reinforcement(dir string, sig float64) (float64, bool) {
	var raw, span float64
	switch dir {
	case "high":
		raw, span = sig-liveNeutral, 1-liveNeutral
	case "low":
		raw, span = liveNeutral-sig, liveNeutral
	default:
		return 0, false
	}
	if raw < liveSignalMargin || span <= 0 {
		return 0, false
	}
	return math.Min(1, raw/span), true
}

// deriveDelta scales magnitude into [1, maxPerSessionDelta]: a faint reinforcement
// still registers; a strong one moves the bar the full amount.
func deriveDelta(mag float64) int {
	return 1 + int(math.Round(mag*float64(maxPerSessionDelta-1)))
}

// deriveSeedStrength scales magnitude into the seed starting-strength band.
func deriveSeedStrength(mag float64) int32 {
	return int32(seedStrengthMin + int(math.Round(mag*float64(seedStrengthMax-seedStrengthMin)))) // #nosec G115 — bounded by the seed band
}

// Daemon lines — grouped, varied content, never a single fixed template.
// The lone FallbackObservation is reserved for a true last resort (no lines).
var (
	movedLines = []string{
		"%s stirred. You moved toward it again tonight.",
		"%s woke up — the daemon felt you lean in.",
		"That was %s. It's getting stronger.",
	}
	formingLines = []string{
		"Something is taking shape. The daemon doesn't have a name for it yet.",
		"A pattern is forming. Give it a few more nights.",
	}
	patientLines = []string{
		"The daemon is still reading you. This takes time.",
		"Too early to name anything. Keep coming back.",
		"It's only starting to see you.",
	}
	// For an established user on a session that moved nothing — present, not patronizing.
	watchingLines = []string{
		"Quiet tonight. The daemon is still here.",
		"Nothing shifted. It's watching all the same.",
		"Noted. The daemon keeps reading.",
	}
)

// composeLine varies by outcome and session, referencing the strongest named move.
func composeLine(moves []Move, seeded bool, sessionCount int) string {
	idx := sessionCount + len(moves)
	if len(moves) > 0 {
		top := moves[0]
		for _, m := range moves {
			if m.Delta != nil && (top.Delta == nil || *m.Delta > *top.Delta) {
				top = m
			}
		}
		return fmt.Sprintf(pick(movedLines, idx), top.Name)
	}
	if seeded {
		return pick(formingLines, idx)
	}
	// Nothing moved: a genuinely new user hears patience; an established one hears
	// a quiet, present line rather than being told it's "too early".
	if sessionCount >= establishedSessions {
		return pick(watchingLines, idx)
	}
	return pick(patientLines, idx)
}

func pick(lines []string, idx int) string {
	if len(lines) == 0 {
		return signal.FallbackObservation
	}
	return lines[((idx%len(lines))+len(lines))%len(lines)]
}
