package handlers

import (
	"crypto/sha256"
	"encoding/binary"
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

type homeResponse struct {
	Day               int           `json:"day"`
	ProcessingSignals int           `json:"processingSignals"`
	AnalystTime       string        `json:"analystTime"`
	Stats             []compileStat `json:"stats"`
	DaemonProse       string        `json:"daemonProse"`
	DailySignalQuote  string        `json:"dailySignalQuote"`
	DailySignalAuthor string        `json:"dailySignalAuthor"`
	OrbState          string        `json:"orbState"`
	DaemonAudioURL    string        `json:"daemonAudioUrl,omitempty"`
}

func (h *handler) GetHome(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var (
		profile  db.ShadowProfile
		state    *dynamo.ShadowState
		patterns []db.PatternLibrary
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

	respondWithJSON(w, http.StatusOK, buildHomeResponse(profile, state, patterns, audioURL))
}

func buildHomeResponse(profile db.ShadowProfile, state *dynamo.ShadowState, patterns []db.PatternLibrary, audioURL string) homeResponse {
	today := time.Now().UTC().Format("2006-01-02")

	// Deterministic signal selection: hash(user_id + date) % len(quotes)
	key := profile.UserID.String() + today
	h := sha256.Sum256([]byte(key))
	idx := int(binary.BigEndian.Uint64(h[:8])) % len(dailySignals)
	if idx < 0 {
		idx = -idx
	}
	sig := dailySignals[idx]

	resp := homeResponse{
		Day:               int(profile.CompileCount),
		ProcessingSignals: len(patterns),
		OrbState:          profile.Stage,
		DailySignalQuote:  sig.Quote,
		DailySignalAuthor: sig.Author,
		Stats: []compileStat{
			{Label: "fragments decoded", Value: strconv.Itoa(int(profile.FragmentsDecoded))},
			{Label: "kernel access", Value: strconv.Itoa(int(profile.KernelAccess)) + "%"},
			{Label: "processes", Value: strconv.Itoa(len(patterns)) + " active"},
		},
	}

	if state != nil {
		resp.DaemonProse = state.DaemonProse
		resp.DaemonAudioURL = audioURL
		resp.AnalystTime = relativeDate(state.Date, today)
	}

	return resp
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
