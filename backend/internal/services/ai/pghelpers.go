package ai

import (
	"math"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

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
