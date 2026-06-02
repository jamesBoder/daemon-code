package ai

import (
	"math"
	"math/big"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// stripMarkdownFence removes ```json ... ``` or ``` ... ``` wrappers that
// Claude sometimes adds despite being asked for raw JSON/text output.
func stripMarkdownFence(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = s[3:]
		if idx := strings.IndexByte(s, '\n'); idx != -1 {
			s = s[idx+1:] // drop the optional language tag line (e.g. "json\n")
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	}
	return strings.TrimSpace(s)
}

func pgDate(dateStr string) pgtype.Date {
	t, _ := time.Parse("2006-01-02", dateStr)
	return pgtype.Date{Time: t, Valid: true}
}

func pgDateToday() pgtype.Date {
	return pgtype.Date{Time: time.Now().UTC().Truncate(24 * time.Hour), Valid: true}
}

// pgNumeric converts a float64 to pgtype.Numeric with 3 decimal places.
// e.g. 0.75 → Int=750, Exp=-3.
func pgNumeric(f float64) pgtype.Numeric {
	scaled := int64(math.Round(f * 1000))
	return pgtype.Numeric{
		Int:   big.NewInt(scaled),
		Exp:   -3,
		Valid: true,
	}
}

func pgTextPtr(s *string) pgtype.Text {
	if s == nil || *s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}
