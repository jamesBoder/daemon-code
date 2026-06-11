package dynamo

import "time"

// ServiceDate returns the UTC calendar date a nightly pipeline output serves —
// the sort-key date that readers (GetDailyDeck, GetShadowState) will ask for
// when the user opens the app.
//
// The nightly compile cron fires at 23:00 UTC; everything it writes is read
// throughout the FOLLOWING UTC day, so runs in the second half of the UTC day
// are stamped with the next day's date. Runs before 12:00 UTC (an early-morning
// cron, or manual/dev runs) serve the current UTC day.
//
// Stamping outputs with the write-time date instead caused the app to appear
// frozen: items written at 23:00 UTC carried a date that was already "yesterday"
// for all but one hour of the user's next day, so every exact-date lookup missed.
func ServiceDate(now time.Time) string {
	now = now.UTC()
	if now.Hour() >= 12 {
		now = now.AddDate(0, 0, 1)
	}
	return now.Format("2006-01-02")
}
