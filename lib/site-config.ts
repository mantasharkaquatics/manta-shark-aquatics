// Outward-facing numbers that are CLAIMS ABOUT THE BUSINESS, not code.
// None of them has a database source, so they live here and are changed by hand
// rather than being scattered through the markup. Update them together and note
// the date, so it is obvious when they were last checked against reality.
//
// Last verified: 2026-08-17

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
