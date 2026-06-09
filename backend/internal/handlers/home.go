package handlers

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"golang.org/x/sync/errgroup"

	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

type dailySignal struct {
	Quote  string
	Author string
}

var dailySignals = []dailySignal{
	{"The most common form of despair is not being who you are.", "Kierkegaard"},
	{"In the midst of winter, I found there was, within me, an invincible summer.", "Camus"},
	{"When we are no longer able to change a situation, we are challenged to change ourselves.", "Frankl"},
	{"The question is not what you look at, but what you see.", "Thoreau"},
	{"He who has a why to live can bear almost any how.", "Nietzsche"},
	{"What we fear doing most is usually what we most need to do.", "Ferriss"},
	{"You do not rise to the level of your goals, you fall to the level of your systems.", "Clear"},
	{"Between stimulus and response there is a space. In that space is our power to choose our response.", "Frankl"},
	{"The cave you fear to enter holds the treasure you seek.", "Campbell"},
	{"We cannot solve our problems with the same thinking we used when we created them.", "Einstein"},
	{"To live is to suffer. To survive is to find some meaning in the suffering.", "Nietzsche"},
	{"What you resist, persists.", "Jung"},
}

type compileStat struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// snapshotThreshold is the minimum compile count before score deltas are shown.
// Must equal snapshotInterval in internal/services/ai/analyst.go — deltas are
// meaningless before the first snapshot is taken.
const snapshotThreshold = 30

type homeResponse struct {
	Day               int           `json:"day"`
	ConsecutiveDays   int           `json:"consecutiveDays"`
	ProcessingSignals int           `json:"processingSignals"`
	AnalystTime       string        `json:"analystTime"`
	Stats             []compileStat `json:"stats"`
	DaemonProse       string        `json:"daemonProse"`
	ShadowPrompt      string        `json:"shadowPrompt,omitempty"`
	DailySignalQuote  string        `json:"dailySignalQuote"`
	DailySignalAuthor string        `json:"dailySignalAuthor"`
	OrbState          string        `json:"orbState"`
	DaemonAudioURL    string        `json:"daemonAudioUrl,omitempty"`
	CompileLogLines   []string      `json:"compileLogLines,omitempty"`
	// Scoring system — three persistent scores
	KernelAccess   int32 `json:"kernelAccess"`
	DaemonAccuracy int32 `json:"daemonAccuracy"`
	DecodedLines   int32 `json:"decodedLines"`
	// Deltas vs. last monthly snapshot — zero until compile 30
	KernelAccessDelta   int32 `json:"kernelAccessDelta"`
	DaemonAccuracyDelta int32 `json:"daemonAccuracyDelta"`
	DecodedLinesDelta   int32 `json:"decodedLinesDelta"`
}

func (h *handler) GetHome(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var (
		profile      db.ShadowProfile
		state        *dynamo.ShadowState
		patterns     []db.PatternLibrary
		sessionDates []time.Time
	)

	g, ctx := errgroup.WithContext(r.Context())

	g.Go(func() error {
		var err error
		profile, err = h.q.GetShadowProfile(ctx, userID)
		return err
	})
	g.Go(func() error {
		var err error
		state, err = h.ddb.GetShadowState(ctx, userID.String())
		return err
	})
	g.Go(func() error {
		var err error
		patterns, err = h.q.GetPatternLibrary(ctx, userID)
		return err
	})
	g.Go(func() error {
		var err error
		sessionDates, err = h.q.GetSessionDates(ctx, userID)
		return err
	})

	if err := g.Wait(); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not load home data")
		return
	}

	var audioURL string
	if state != nil && state.AudioURL != "" && !strings.HasPrefix(state.AudioURL, "https://") {
		req, err := h.s3presign.PresignGetObject(r.Context(), &s3.GetObjectInput{
			Bucket: aws.String(h.cfg.AudioBucket),
			Key:    aws.String(state.AudioURL),
		}, s3.WithPresignExpires(24*time.Hour))
		if err == nil {
			audioURL = req.URL
		}
	}

	now := time.Now().UTC()
	resp := buildHomeResponse(profile, state, patterns, audioURL, now)
	resp.ConsecutiveDays = streakLen(sessionDates, now)
	respondWithJSON(w, http.StatusOK, resp)
}

func buildHomeResponse(profile db.ShadowProfile, state *dynamo.ShadowState, patterns []db.PatternLibrary, audioURL string, now time.Time) homeResponse {
	today := now.Format("2006-01-02")

	// Deterministic signal selection: hash(user_id + date) % len(quotes)
	key := profile.UserID.String() + today
	h := sha256.Sum256([]byte(key))
	idx := int(binary.BigEndian.Uint64(h[:8]) % uint64(len(dailySignals))) // #nosec G115 — safe: result bounded by len
	if idx < 0 {
		idx = -idx
	}
	sig := dailySignals[idx]

	// Prefer archetype-matched signal written by SignalSelector Lambda; fall back to hash selection.
	sigQuote := sig.Quote
	sigAuthor := sig.Author
	if state != nil && state.SignalQuote != "" {
		sigQuote = state.SignalQuote
		sigAuthor = state.SignalAuthor
	}

	resp := homeResponse{
		Day:               int(profile.CompileCount),
		ProcessingSignals: len(patterns),
		OrbState:          profile.Stage,
		DailySignalQuote:  sigQuote,
		DailySignalAuthor: sigAuthor,
		Stats: []compileStat{
			{Label: "fragments decoded", Value: strconv.Itoa(int(profile.FragmentsDecoded))},
			{Label: "kernel access", Value: strconv.Itoa(int(profile.KernelAccess)) + "%"},
			{Label: "daemon accuracy", Value: strconv.Itoa(int(profile.DaemonAccuracy)) + "%"},
			{Label: "processes", Value: strconv.Itoa(len(patterns)) + " active"},
		},
		// Scoring system
		KernelAccess:   profile.KernelAccess,
		DaemonAccuracy: profile.DaemonAccuracy,
		DecodedLines:   profile.FragmentsDecoded,
	}

	// Deltas vs. last snapshot — only meaningful after the first snapshot at compile snapshotThreshold
	if profile.CompileCount >= snapshotThreshold {
		resp.KernelAccessDelta = profile.KernelAccess - profile.KernelAccessPrev
		resp.DaemonAccuracyDelta = profile.DaemonAccuracy - profile.DaemonAccuracyPrev
		resp.DecodedLinesDelta = profile.FragmentsDecoded - profile.DecodedLinesPrev
	}

	if state != nil {
		resp.DaemonProse = state.DaemonProse
		resp.ShadowPrompt = state.ShadowPrompt
		resp.DaemonAudioURL = audioURL
		resp.AnalystTime = relativeDate(state.Date, today)
		if state.CompileLogLines != "" {
			var lines []string
			if err := json.Unmarshal([]byte(state.CompileLogLines), &lines); err == nil && len(lines) > 0 {
				resp.CompileLogLines = lines
			}
		}
	}

	return resp
}

// streakLen returns how many consecutive days (ending today or yesterday) the user has played.
// Returns 0 if the most recent session was 2+ days ago.
func streakLen(dates []time.Time, now time.Time) int {
	if len(dates) == 0 {
		return 0
	}
	today := now.Truncate(24 * time.Hour)
	mostRecent := dates[0].UTC().Truncate(24 * time.Hour)
	if today.Sub(mostRecent) > 24*time.Hour {
		return 0
	}
	count := 1
	for i := 1; i < len(dates); i++ {
		prev := dates[i-1].UTC().Truncate(24 * time.Hour)
		curr := dates[i].UTC().Truncate(24 * time.Hour)
		if prev.Sub(curr) == 24*time.Hour {
			count++
		} else {
			break
		}
	}
	return count
}

func relativeDate(date, today string) string {
	if date == "" {
		return ""
	}
	if date == today {
		return "today"
	}
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "recently"
	}
	tod, _ := time.Parse("2006-01-02", today)
	if tod.Sub(t).Hours() < 48 {
		return "yesterday"
	}
	return "recently"
}
