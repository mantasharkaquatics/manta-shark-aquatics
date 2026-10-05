// Outward-facing settings that are decisions about the business, not code,
// changed here by hand. (The hero/testimonial figures that lived here --
// rating, review count, students coached -- were no longer shown anywhere and
// were removed 2026-10-05.)

/** Canonical origin, no trailing slash. The apex is canonical — www redirects to it. */
export const SITE_URL = 'https://mantasharkaquatics.net'

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
