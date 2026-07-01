// Shared date utilities. All "today" and date-string calculations
// use America/Los_Angeles timezone since all customers are in Southern California.
// Using toISOString() for date-only strings is a bug: it converts to UTC,
// which can shift the calendar day near the UTC day boundary
// (e.g. 5-8pm Pacific Time is already the next day in UTC).

export function formatDateLA(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const d = parts.find(p => p.type === 'day')?.value
  return y + '-' + m + '-' + d
}

export function getTodayLA(): string {
  return formatDateLA(new Date())
}
