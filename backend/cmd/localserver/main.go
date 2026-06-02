package main

import (
	"log"
	"net/http"

	"github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/dynamo"
	"github.com/jamesboder/daemon-code/internal/handlers"
	"github.com/jamesboder/daemon-code/internal/middleware"
)

func main() {
	cfg := config.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}

	ddb := dynamo.NewClient(cfg)
	queries := db.New(pool)

	mux := handlers.NewRouter(cfg, queries, ddb)
	mux = middleware.CORS(mux)
	mux = middleware.Logger(mux)

	addr := ":8080"
	log.Printf("local server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server: %v", err)
	}
}
