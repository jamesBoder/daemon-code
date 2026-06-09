package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5"
)

func main() {
	conn, err := pgx.Connect(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect failed: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(context.Background())

	matches, err := filepath.Glob("internal/db/migrations/*.sql")
	if err != nil {
		fmt.Fprintf(os.Stderr, "glob failed: %v\n", err)
		os.Exit(1)
	}
	sort.Strings(matches)

	for _, path := range matches {
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
