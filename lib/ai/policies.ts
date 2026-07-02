// Business policies fed to the AI chat assistant.
// When a policy changes: edit this file, npm run build, git push.
export const POLICIES = `
=== POLICIES ===
- Reschedule / cancel: must be done more than 24 hours before the lesson start time. Within 24 hours, lessons cannot be rescheduled or cancelled online.
- Next-day booking cutoff: online booking for the next day closes at 7:30 PM Pacific Time.
- Check-in: check-in opens 30 minutes before the lesson start time.
- Lesson credits are shared across all swimmers on the same family account and are consumed oldest-first.
- Payments are processed securely by Stripe. The AI assistant can never charge a card or issue refunds.
`.trim()
