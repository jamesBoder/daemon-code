package handlers

import (
	"net/http"

	"golang.org/x/sync/errgroup"

	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

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

	respondWithJSON(w, http.StatusOK, buildHomeResponse(profile, state, patterns))
}

func buildHomeResponse(profile db.ShadowProfile, state *dynamo.ShadowState, patterns []db.PatternLibrary) homeResponse {
	resp := homeResponse{
		Day:               int(profile.CompileCount),
		ProcessingSignals: len(patterns),
		OrbState:          profile.Stage,
	}

	if state != nil {
		resp.DaemonProse = state.DaemonProse
		resp.DaemonAudioURL = state.AudioURL
		resp.AnalystTime = state.Date
	}

	return resp
}
