package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	conn, err := pgx.Connect(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect failed: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(context.Background())

	migrations := []string{
		"internal/db/migrations/001_initial_schema.sql",
		"internal/db/migrations/002_add_polly_voice.sql",
		"internal/db/migrations/003_add_daemon_accuracy.sql",
	}

	for _, path := range migrations {
		sql, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read %s: %v\n", path, err)
			os.Exit(1)
		}
		if _, err := conn.Exec(context.Background(), string(sql)); err != nil {
			fmt.Fprintf(os.Stderr, "run %s: %v\n", path, err)
			os.Exit(1)
		}
		fmt.Printf("ok %s\n", path)
	}
}
