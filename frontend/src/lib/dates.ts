// Helpers for "YYYY-MM-DD" date strings (pgtype.Date columns, dynamo date keys).
// Parsed as local time — `new Date("YYYY-MM-DD")` is UTC and shifts a day in
// negative-offset timezones.

const MS_PER_DAY = 86_400_000

export function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-')
  return new Date(Number(year), Number(month) - 1, Number(day))
}

export function formatDateLong(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

// Inclusive day count: a date of today returns 1
export function daysSince(iso: string): number {
  const elapsed = Date.now() - parseLocalDate(iso).getTime()
  return Math.max(1, Math.floor(elapsed / MS_PER_DAY) + 1)
}
