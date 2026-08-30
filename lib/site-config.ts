// Outward-facing numbers that are CLAIMS ABOUT THE BUSINESS, not code.
// None of them has a database source, so they live here and are changed by hand
// rather than being scattered through the markup. Update them together and note
// the date, so it is obvious when they were last checked against reality.
//
// Last verified: 2026-08-17

/** Canonical origin, no trailing slash. The apex is canonical — www redirects to it. */
export const SITE_URL = 'https://mantasharkaquatics.net'

export const SITE_STATS = {
  /** Google rating shown in the hero and above the testimonials. */
  googleRating: '5.0',
  /** Google review count shown above the testimonials. */
  googleReviewCount: 13,
  /** Cumulative students taught, hero stat. */
  studentsCoached: '500+',
  /** Hero stat, a positioning claim rather than a measurement. */
  progressFocused: '100%',
} as const

/**
 * Hiring. The careers page stays up and indexed either way -- it is the one page
 * exempt from the pre-launch noindex, and losing its ranking to save a month of
 * being closed would be a bad trade.
 *
 * What `open` actually changes: when it is false the JobPosting structured data
 * is not emitted at all, and the page says we are not hiring and invites people
 * to leave their details. Advertising a job to Google that does not exist is
 * what gets a domain distrusted; saying "not right now, tell us about yourself"
 * costs nothing and keeps the pipeline warm.
 *
 * datePosted is the REAL date the posting went up. Do not compute it -- filling
 * it with today's date on every deploy tells Google the job is brand new every
 * time the site changes, which is untrue and against their job-posting guidance.
 * After validThrough, Google drops the posting from Google Jobs entirely, so
 * both dates need a human to move them when hiring is refreshed.
 */
export const HIRING = {
  open: true,
  datePosted: '2026-08-18',
  validThrough: '2027-02-18',
} as const
