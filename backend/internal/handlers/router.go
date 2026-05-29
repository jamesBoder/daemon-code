package handlers

import (
	"net/http"

	"github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/middleware"
	"github.com/jamesboder/daemon-code/internal/services"
)

func NewRouter(cfg *config.Config, q *db.Queries, ddb *dynamo.Client) http.Handler {
	mux := http.NewServeMux()

	tokens := services.NewTokenService(cfg)
	h := &handler{cfg: cfg, q: q, ddb: ddb, tokens: tokens}

	// Public auth routes
	mux.HandleFunc("POST /auth/register", h.Register)
	mux.HandleFunc("POST /auth/login", h.Login)
	mux.HandleFunc("GET /auth/refresh", h.Refresh)

	// Protected routes — require valid JWT
	protected := http.NewServeMux()
	protected.HandleFunc("GET /profile", h.GetProfile)
	protected.HandleFunc("GET /home", h.GetHome)
	protected.HandleFunc("GET /session/today", h.GetSessionToday)
	protected.HandleFunc("POST /session/response", h.PostSessionResponse)
	protected.HandleFunc("POST /session/mood", h.PostMood)
	protected.HandleFunc("GET /processes", h.GetProcesses)
	protected.HandleFunc("GET /processes/{id}", h.GetProcess)
	protected.HandleFunc("POST /onboarding/complete", h.OnboardingComplete)

	mux.Handle("/", middleware.RequireAuth(cfg.JWTSecret)(protected))

	return mux
}

type handler struct {
	cfg    *config.Config
	q      *db.Queries
	ddb    *dynamo.Client
	tokens *services.TokenService
}
