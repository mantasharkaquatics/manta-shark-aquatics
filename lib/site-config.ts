// Outward-facing settings that are decisions about the business, not code,
// changed here by hand. (The hero/testimonial figures that lived here --
// rating, review count, students coached -- were no longer shown anywhere and
// were removed 2026-10-05.)

/** Canonical origin, no trailing slash. The apex is canonical — www redirects to it. */
export const SITE_URL = 'https://mantasharkaquatics.net'

/**
 * Email addresses (owner, 2026-10-13). The school's mailboxes are Google
 * Workspace on the .com domain; info@ and alerts@ are Google Groups there that
 * deliver to the staff in them. info@mantasharkaquatics.net never had a
 * mailbox, so mail written to it was lost.
 *
 * Mail still LEAVES from the .net address, because that is the domain verified
 * in Resend; every message carries Reply-To: CONTACT_EMAIL so a family's reply
 * reaches a person. When .com is verified in Resend, move EMAIL_FROM to .com.
 */
export const CONTACT_EMAIL = 'info@mantasharkaquatics.com'
export const EMAIL_FROM = 'Manta Shark Aquatics <info@mantasharkaquatics.net>'
/** Staff alerts when ADMIN_ALERT_EMAIL is not set in the environment. */
export const ALERT_EMAIL_FALLBACK = 'alerts@mantasharkaquatics.com'

/**
 * The school's postal address, printed at the foot of every marketing email
 * (the birthday card, lib/birthday.ts). US law (CAN-SPAM) requires a real
 * street address, PO box or registered private mailbox in any commercial
 * email, so while this is empty NO birthday card is sent to a family -- the
 * daily job skips and says why, and only test cards to staff go out.
 * Owner, 2026-10-14.
 */
export const SCHOOL_MAILING_ADDRESS = '382 N Lemon Ave Ste 821, Walnut, CA 91789'

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
