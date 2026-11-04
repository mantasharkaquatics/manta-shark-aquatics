<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Measure the browser, don't read the code

Two responsive bugs in this repo were found by the browser after the code had
already said "looks fine", and two non-bugs were reported by static reasoning
that the browser then cleared:

- A regex over `<input ...>` tags said one field in the whole app was under
  16px. The pattern broke on the `>` inside `onChange={e => ...}`. The real
  answer, measured, was every field on every form.
- `getBoundingClientRect().right > viewport` flags the decorative rings in the
  `/about` and `/levels` heroes as overflow. They sit inside `overflow: hidden`
  parents and break nothing — the rect ignores ancestor clipping. Use
  `document.body.scrollWidth` for "is this page actually wider than the screen".

Chrome on macOS will not resize below about 500px. To check a phone width,
temporarily set `document.body.style.width = '360px'`, measure, then restore
`cssText`. Fixed-position elements track the viewport, not the body, so exclude
them from any overflow scan.

# The fonts are in the project, not fetched from Google

app/layout.tsx loads Figtree, Fraunces, Nunito Sans and Geist Mono with
next/font/local from app/fonts (the Latin variable files, from Fontsource's
@fontsource-variable packages; SIL Open Font License, the *-OFL.txt files
beside them). next/font/google fetched them from Google during every build,
and that fetch failed now and then on Vercel -- red deployments with nothing
wrong in the code (owner, 2026-10-31). Do not go back to next/font/google; a
new face or a new language's letters go into app/fonts the same way.

# Shared responsive rules live in app/globals.css

That file is the only stylesheet the root layout imports, and its tail holds
the rules that apply across pages: the 16px input floor that stops iOS zooming,
the 44px tap-target floor, checkbox sizing, `.footer-grid`, `.pos-grid`.

A rule that styles a component used on more than one page belongs there, NOT in
a page's own `<style>` block. A page-scoped block only exists while that page is
mounted — the footer collapse rule lived in `HomeContent` and so worked on the
home page and nowhere else in the site.

Inline `style={{}}` is used heavily here, and an inline style outranks any
stylesheet rule without `!important`. That is why those rules carry it.

# CSS traps this project has already fallen into

Each of these cost a round of "why does it look like that", and two of them cost
two rounds because the same mistake was made twice.

- **`overflow-x: auto` clips the other axis too.** There is no way to scroll one
  axis and let the other overflow — set `overflow-x`, and `overflow-y` stops
  being `visible`. The plan cards' "Most popular" ribbon is at `top: -12px`, so
  turning the row into a swipe row sliced every ribbon in half. Reserve padding
  inside the scroll box for anything that pokes out of it.
- **`scroll-snap-align` aligns to the scrollport, not to your padding.** With
  `padding-inline` alone, card one rests inset (the padding put it there at
  scroll 0) and every card after it snaps flush to the edge. `scroll-padding-inline`
  moves the snap line itself.
- **iOS `100vh` includes the area behind Safari's chrome.** Centring inside
  `min-h-screen` therefore puts the content below the visual centre on a phone.
  Use `min-h-dvh`. Safari's bottom toolbar also floats over the page, so a page
  with no footer needs bottom padding or its last row cannot be tapped.
- **`:hover` latches on touch.** After a tap the element keeps its hover state
  until you tap elsewhere, which made one carousel arrow sit filled-gold and read
  as a stuck toggle. Wrap hover styling in `@media (hover: hover)`.
- **A `<select>`'s popup is drawn by the OS and cannot be styled.** The closed
  control can (`appearance-none` plus your own chevron); the menu cannot. If the
  menu has to match the site, do not use a select.
- **Global rules that only grow things still break things.** A blanket
  `button { min-height: 44px }` on phones stretched nine controls that set their
  own geometry — both toggle switches into blobs, a copy icon out of its text
  line, the carousel dots into 8x44 slivers. `.tap-auto` opts out. When adding a
  rule like this, check what it *distorted*, not only what it enlarged.

# The curriculum is 7 levels x 3 stages

`lib/levels.ts` is the single source for level names, colours and the stage
helpers. Four clients used to keep their own copy of `LEVEL_NAMES` and they had
already drifted; import from that file instead of pasting a fifth.

Facts the code depends on:

- A level holds 9-16 skills split across exactly three stages. `skills.stage`
  is 1, 2 or 3; `students.current_stage` is where the swimmer sits.
- **Assessment picks the level. Everyone starts that level at stage 1.**
  Every level change goes through `setStudentLevel()` in `lib/level-change.ts`
  (used by `/api/admin/assign-level`, `/api/admin/review-level` and
  `/api/admin/review-assessment`). It writes the `level_upgrades` row first and
  the student second, so a failure cannot leave a swimmer moved with no record,
  and it sets `current_stage: 1`. A new route that sets `current_level` must
  call it rather than update `students` directly.
- **The assessment is a lesson report with a level attached.** For a swimmer
  with no level, the coach picks a recommended level on /coach/progress, scores
  that level's skills and records the note; `/api/coach/lesson-note` stores all
  three as pending (the skill scores go to `progress_history` only, not
  `student_skill_progress`). The admin confirms them as ONE card in Reviews.
  The desk check-in no longer offers to assign a level.
- A stage is finished only when **every** skill in it reads 100. The database
  trigger `check_level_upgrade()` and `stageProgress()` in `lib/levels.ts` use
  the same rule on purpose, so the bar a parent sees and the promotion that
  follows it cannot disagree.
- **The trigger advances stages, never levels.** Finishing stage 3 leaves the
  swimmer there; moving up a level stays a coach recommendation an admin
  approves. Do not "fix" this by making the trigger promote.
- **No coach report touches the live skill table until an admin confirms it**
  (2026-10-05, not only assessments). `/api/coach/lesson-note` writes the
  pending `progress_history` row only; `review-progress` and `report-edit` write
  `student_skill_progress` through `lib/skill-progress-sync.ts`, so the stage
  trigger can only fire on an approved report. The coach's own recorder lays
  pending scores over the live ones (`pendingOverlay`).
- Parents cannot read `student_skill_progress` (RLS gives it to coaches only).
  The parent dashboard therefore derives current percentages by merging
  `progress_history` snapshots newest-first. Do not switch it to the live table
  without adding a policy.
- Skill ids never changed in the 9-to-7 migration, so every historical snapshot
  still resolves. Keep it that way: move a skill between levels, don't recreate it.

# The admin review queues are expensive on purpose-avoidance

`lib/admin/review-queues.ts` is the single source for what is waiting on an
admin. `/admin/reviews` renders it; the sidebar badge counts it.

It is slow by nature: the missing-progress pass reads every confirmed booking
ever made, its attendance, its session, and the progress already recorded, then
takes the difference. Measured at roughly a second, and it grows with the
booking table.

That is why the sidebar badge is fetched from `/api/admin/review-count` by the
client *after* paint, and why that route holds its answer for 60s. Do not
"simplify" this by computing the count in `app/admin/layout.tsx` — the layout
renders on every admin page, and that change makes the entire back office a
second slower to load. The numbers are in commit 3a692da.

# Who reads which language

Owner's rule, 2026-08-27: **anything a customer can see must be translatable.**
Legal documents are the exception. Staff screens have their own switch: the
coach portal and the admin back office each read English or Traditional Chinese
from the staff member's own account (`coaches.ui_language`, `admins.ui_language`;
owner, 2026-10-02 for admin).

- Parent-facing (`app/(public)/**`, the components they render): every string
  goes through `t()`. Not only text -- `placeholder`, `title`, `alt` and
  `aria-label` too. An icon button's `aria-label` is its only readable name, so
  an untranslated one is English read aloud on a Chinese page.
- Legal pages stay English: `terms`, `privacy-policy`, `waiver`,
  `media-release`, `sms-terms`, `policies`. Translating them creates two texts
  that can disagree, and then a question about which one governs.
- Admin and coach screens go through `t()` too, but offer only `en` and
  `zh-Hant` (no 简中). Server components there use `getAdminLocale()` +
  `getT()`; client components use `useT()` as everywhere else. Dates follow
  the language via `dateTag()`; clock times stay 12-hour `3:35 PM`. What the
  desk sends OUT -- SMS/email text, invoice and receipt content, CSV exports,
  Stripe descriptions -- stays English, and so does anything typed by a person
  or written by the AI.
- Not everything English is a miss: `MSA-XXXXXX` is a code format, and `alt`
  text that is the company name is the company name.
- The AI assistant answers in whatever language the parent wrote in
  (`lib/ai/system-prompt.ts`); only the chrome around it needed keys.

Each language is two files: `lib/i18n/locales/<lang>.json` (public site and
parent pages) and `lib/i18n/locales/staff/<lang>.json` (`admin.*`, and
`coach.*` except the coach login page). The browser builds in only English site
text; other languages arrive from the layout (`messages` prop, from
`lib/i18n/all.ts`) or are fetched on demand (`lib/i18n/load.ts`). Server code
that translates imports `getT` / `translate` from `@/lib/i18n/all` -- from plain
`@/lib/i18n` it would only find English. Never import `all.ts` into a
`'use client'` file: that puts every language back into every page.

`node scripts/i18n-check.mjs` fails on a key missing from any locale, on a key
in the wrong one of the two files, and on orphans. It does not know about a string you never wrapped -- that part is on
you.

# Locations: the school teaches at more than one pool

`locations` (docs/migration-locations.sql) holds one row per pool -- `brea`,
`monrovia` -- with `is_active` = families can see and book it. `lib/locations.ts`
has the type and helpers.

- **Zones carry the pool.** Each block of a coach's hours
  (`coach_availability_zones.location_id`) belongs to one pool; that is where
  the admin decides where a coach is. A coach may be at both pools, even on
  the same day. Coaches with no zone rows (legacy) count as Brea.
- **Lessons get it by trigger.** `class_sessions.location_id` is filled by a
  database trigger from the coach's zone covering the lesson start. No route
  sets it by hand; moving a lesson re-runs it. Repainting a coach's zones does
  NOT: lessons already booked keep their pool, and the zone save lists them
  (`pool_warnings`) for the desk.
- **Everything shows only when more than one pool is active**
  (`showLocations(all)`). With one, every page, email and SMS reads exactly as
  it did before locations: no picker, no location line, no /locations pages,
  and `{place}` in titles is "Brea" (`lib/location-place.ts`). Build anything
  new that way. Two exceptions: a lesson at a pool that is NOT the open one
  (a hidden pool) is still named, to its family and coach (`lessonPoolShown`);
  and if the one open pool is not Brea, `{place}` and the footer name it.
- **Hidden = families cannot book there.** Parent booking routes offer and
  accept only blocks at open pools (`familyCanBookAt`, `familyZones` in
  `lib/zones.ts`); staff routes are not limited.
- **The address is for families with a booking** (owner, 2026-10-22). Address,
  map link, phone, arrival notes and the check-in point are not readable with
  the publishable key (docs/migration-safety-info.sql); the public site reads
  `PUBLIC_LOCATION_COLUMNS`, `/api/locations` sends them only to a family with
  a booking, and the AI never has them. Lesson emails and the reminder SMS say
  the pool whenever it has an address, even with one pool open
  (`lessonPlaceShown`).
- Points, prices and programs are the same at every pool. The booking page
  keeps pools separate: pick the pool (`?location=`), then only its times.
- Prerendered public pages read the pools through `lib/public-locations.ts`
  (one cached read, refreshed every 300s) and treat a failed read as one pool.
  The /zh-Hant and /zh-Hans pool pages exist only for ids present at build
  (`app/[locale]` has `dynamicParams = false`), so a brand-new pool row needs a
  deploy before its Chinese pages resolve.

# Zelle is cash sent remotely

Owner, 2026-10-21. Nothing credits a family from a Zelle by itself.
`lib/zelle-server.ts` reads Bank of America's "<name> sent you $x" emails from
the company mailbox (Gmail, read-only, connected once by the owner on
/admin/zelle) every 5 minutes (`/api/cron/zelle-sync`) and keeps one
`zelle_receipts` row per email. POS has a third payment button, Zelle, and a
Zelle sale must name one of those rows (`zelleReceiptId`).

- Every `/api/pos/complete-*` route is wrapped in `withZelle()`. A route calls
  `z.claim()` after its checks and before its first write, and `z.wrote()`
  right after the first thing it writes. The wrapper gives the amount back when
  the sale ends having written nothing. A new desk sale route must do the same,
  or a Zelle can be spent twice or never.
- `zelle_allocate()` locks the receipt row, so two desks can never use more
  than the bank received. One receipt may pay for several sales.
- Only an email whose first Authentication-Results header (Google's) says DKIM
  passed for bankofamerica.com, sent from ealerts.bankofamerica.com, is
  `verified`; anything else is shown with a warning and POS refuses it.
- The three tables and the function are server-only (RLS on, no policies).

# Waitlists hold places through the renewal-hold machinery

Owner, 2026-10-22. `lib/waitlist.ts`, table `waitlist_entries`
(docs/migration-waitlist.sql). A family waits for a full Swim Team squad, a
full 1-on-4 class, or a coach's 1-on-1 time someone else has. When a place
opens, only the first in line is offered it (email + text) and it is held for
12 hours (2 when the lesson is under 24 hours away); unbooked, it lapses and
the next family is offered it. `runWaitlist()` runs in the cleanup cron.

- A class or time offer is a `Hold` (`source: 'waitlist'`):
  `renewalHolds()` returns waitlist holds too, so every path that already
  respects renewal holds -- openings, group classes, recurring, hour, desk
  checks, the AI -- keeps other families out. A new booking path must read
  `renewalHolds` (or `renewalHoldsInWay`) the same way.
- A squad offer counts as a taken seat: `teamSeatsHeld` / `teamSeatsHeldAll`
  wherever the squad cap is checked.

# A family can have a second guardian

Owner, 2026-10-22. `lib/guardians.ts`, table `parent_guardians`
(docs/migration-guardians.sql). The main account invites one second guardian
from My Account; they get their own login and the same rights -- book,
cancel, top up, the same points, a copy of every family email. Only the main
account invites or removes them, and only it changes the account's email and
phone. Text messages still go to the main account's phone only.

- **Never look a family up by `parents.auth_user_id` again.** Server code uses
  `familyOf(svc, user.id, cols)` or `requireParent()` (lib/api-auth.ts; its
  `guardianId` says who is signed in). Browser code uses `myParentId()`
  (lib/my-parent.ts), the same `my_parent_id()` function the RLS policies use.
  A lookup by auth_user_id silently treats a guardian as having no family.
- A new "own family" RLS policy uses `(select public.my_parent_id())`.
- Removing a guardian deletes their login (banned if that fails), so access
  ends at once and the address can be used again.

## View-only family members (owner, 2026-10-23)

`parent_guardians.role` is 'full' (the one second guardian above) or
'viewer' (up to two; `MAX_BY_ROLE` in lib/guardians.ts;
docs/migration-guardian-roles.sql). A viewer sees the schedule and the
swimmers' learning (records, reports, learning map, monthly report,
certificates, team practice times), may chat, give monthly-report feedback,
use the suggestion box and check a swimmer in. No points, payments,
receipts, booking, cancelling, moving, partner invitations or account
changes.

- **Closed by default.** `familyOf()` and `requireParent()` return no family
  for a viewer unless the route passes `{ viewer: true }`. A new parent route
  stays closed to viewers unless all it does is show the schedule or
  learning; open it deliberately. `role` on the result says who it is.
- Pages: `myFamilyRole()` (lib/my-parent.ts, the `my_family_role()` RPC)
  hides what a viewer cannot do; the dashboard root gets `.msa-viewer`, which
  hides every `.msa-lesson-actions`. The server refuses regardless.
- RLS: points, credits, invoices and the parents UPDATE use
  `my_paying_parent_id()` (main + full only). Lessons, swimmers, reports and
  chat keep `my_parent_id()`.
- Email: `guardianCopies()` copies a viewer only on `VIEWER_COPY` (lesson
  and learning mail). The AI chat gives a viewer only `VIEWER_TOOLS`
  (look-ups and the desk) and tells them the main account books and pays.

# Tier 3 (owner, 2026-10-22): cards, visitors, account self-service

- **Saved cards.** Checkout for points and the Swim Assessment passes the
  family's Stripe customer (`familyCustomer` / `checkoutCustomer` in
  lib/stripe-customer.ts) with the "save this card" box. A new parent
  checkout must do the same. Cards are listed and removed through
  /api/parent/cards; nothing about a card is stored on our side but the
  customer id. Automatic top-up is NOT built: it waits for the lawyer.
- **Visitors can ask for a person** (/api/chat/guest/contact): name + email
  on the thread, mode 'human', desk alerted like a family hand-off, and every
  desk reply is emailed to them from /api/admin/chat-message. Never text a
  visitor; they have not agreed to the SMS terms.
- **My Account** has the photo/video consent switch and "request account
  deletion" (/api/parent/account). Deletion is a request the desk settles
  (points, lessons, team) before deleting; only the main account can ask.

# Recalled chat messages (owner, 2026-10-23)

Admin > Messages can recall a desk or AI reply up to 24 hours old
(/api/admin/chat-recall, docs/migration-chat-recall.sql). The row stays with
`recalled_at` / `recalled_by`; the desk sees it folded, the family sees nothing.

- Families read chat_messages through RLS, and the policy skips recalled rows.
  **Every server read (service role) of a conversation a family, a visitor or
  the AI will see must add `.is('recalled_at', null)`** -- the guest chat, the
  AI's history and the unread-reply email already do.
- An open family chat drops it on a `recall` broadcast on `chat:<thread id>`;
  the guest chat drops it on its 15-second poll.
- A visitor's reply email is held 2 minutes by Resend (`sendEmailWithId` with
  `scheduledAt`, id kept in `chat_messages.email_id`); a recall in that time
  cancels it. After that the email is out and the desk is told so.

# A pool can be closed in one step (owner, 2026-10-23)

Admin > Closures (lib/closures.ts, docs/migration-pool-closures.sql). The
desk picks a pool, a day / several days / part of one day, and a reason
(preset, translated -- or its own words, sent as typed).

- **Blocking reuses coach_time_off.** A closure adds 'admin_block' rows with
  `closure_id` for every coach's hours at that pool, so every path that
  already respects time off (booking page, AI, desk tools) offers nothing in
  it. A coach also at another pool that day is blocked only at this one.
  "Open booking again" deletes those rows; the lessons stay cancelled.
- **Cancelling is a school cancellation** (`cancelled_by_school`): points and
  vouchers back in full, no allowance spent, paid assessments stay owed,
  lessons already over left alone. One email per lesson
  (`block_cancellation_notice` with `closureReasonKey`), one text per family
  when a lesson is within 48 hours (`textClosure`). Swim Team families with a
  practice there get `team_practice_cancelled`; the fee does not change.
- **Everyone sees it:** components/ClosureBanner under the nav bar on every
  page (via /api/closures, cached 60s) until the closure ends or the desk
  hides it; the AI gets the active closures in its dynamic context.

# Follow-ups: families who could slip away (owner, 2026-10-23)

lib/follow-ups.ts, Admin > Follow-ups, docs/migration-family-notices.sql.

- **After a Swim Assessment with nothing booked:** an email on day 3 and
  day 14 after the report is confirmed (recommendation, assessment credit
  left, book button). Sent by the daily 9:00 low-balance cron, which calls
  `sendAssessmentFollowUps`; a step more than 4 days late is skipped.
- **Not seen for a while:** listed for the desk only. No automatic email
  (owner: some families come only in summer).
- **Summer registration:** sent only when the owner presses the button,
  once per family per year.
- All three are marketing mail: newsletter subscribers only, unsubscribe link
  and postal address, one `family_notices` row per email so none goes twice.

# Error alerts (owner, 2026-10-26)

lib/error-report.ts, docs/migration-error-alerts.sql. In production the site
emails the school (ADMIN_ALERT_EMAIL) about its own errors -- no Sentry.

- **console.error IS the alert.** instrumentation.ts wraps it on the server,
  because most routes catch, log and answer 500 and Next never sees those.
  So: log real failures with console.error, and expected outcomes (a family
  typed a wrong code, a slot was taken) with console.log or console.warn --
  an expected outcome on console.error will mail the school.
- Uncaught errors come through onRequestError; browser errors through
  components/ClientErrorReporter.tsx and /api/client-error.
- Grouped by signature (ids and numbers taken out): first one mails at once,
  repeats within the hour only count; 20 mails an hour at most (5 from
  browsers); everything is in the daily summary sent by the 9:00 low-balance
  run. requireCron records each job's run in cron_runs; a job that goes quiet
  is mailed every 12 hours.
- Only when VERCEL_ENV is production (ERROR_ALERTS_FORCE=1 to test locally).

# Two databases: live and test (owner, 2026-10-26)

The live site (Vercel production) uses Supabase `uobflteojebscsfiortb`.
Everything else -- preview links and `next dev` -- uses the test project
`manta-dev` (`wzthqtzjwrnygjcbjlak`), set through the Preview environment
variables on Vercel and `.env.local`. Never point a laptop at the live
database again: that is how test bookings landed in real coaches' calendars.

- manta-dev was copied from production on 2026-10-26: the same tables,
  functions, triggers, RLS policies, grants and storage buckets (checked by
  fingerprint), plus the curriculum, course types, team tiers, pools and the
  coaches' weekly hours. No family, booking or payment was copied; coaches
  have placeholder emails and no PIN.
- **A schema change is two runs:** the SQL goes to the live project and to
  manta-dev. A migration run on one only will make the two disagree.
- lib/test-mode.ts: outside production, email goes only to DEV_EMAIL_ALLOW
  addresses (none if unset) and no text message is sent -- both are logged,
  so a sign-up code can be read from the server log. New sending code must
  go through sendEmail / sendRawEmail / sendSms, which apply this.

# Push notifications to the phone app (owner, 2026-10-27)

lib/push.ts (Firebase Cloud Messaging, both iPhone and Android),
lib/push-text.ts (the words), docs/migration-push.sql, components/AppBridge.tsx
(the phone side), /api/push/device and /api/push/settings.

- **A push rides on the family email.** sendEmailWithId calls pushForEmail for
  the kinds that have one: reminder, booked (and series), moved, cancelled,
  school cancellation / closure, Swim Team closure, waitlist offer. A new
  sender of those emails pushes for free; a new kind of notice needs an entry
  in PUSHED and its words in push.* (three languages). The lesson report has
  no email; review-progress calls pushReport.
- **Push replaces the text, not the email.** familyUsesApp: the main account
  has a phone with the app, notifications allowed, opened within 60 days, and
  that switch on. Then the reminder cron, the school-cancel / closure texts
  and the waitlist text skip the SMS. Otherwise SMS exactly as before.
- Recipients mirror email: main, full guardian, view-only (viewerOk =
  VIEWER_COPY). Each person has three switches (reports / reminders /
  bookings) in My Account, shown only inside the app; closures and school
  cancellations ('always') have none.
- Never put the pool's address in a push (it shows on a locked screen).
- Nothing is sent until FCM_SERVICE_ACCOUNT (the Firebase service account
  JSON, as is or base64) is set; without it every family keeps its texts.
- In the browser none of this runs: lib/native-app.ts only answers inside the
  app, where Capacitor puts its bridge on window.
- The admin family page (/admin/members/<id>) lists the family's phones with
  the app (whose, allowed, last opened -- never the token) and has "Send a
  test notification" (/api/admin/push-test, pushTest): sent as 'always', so a
  switched-off kind cannot make the test look broken. Two clicks; real
  families get it only when the desk means to.

# The phone app's own look (owner, 2026-10-27)

Inside the app the site is not the website: no website bar, footer or chat
bubble; a top bar and five tabs instead -- 首頁 /dashboard, 預約 /booking,
課表 /dashboard/schedule, 訊息 (opens the chat), 我的 /dashboard/me
(components/AppShell.tsx). Browsers, phones included, keep the website.

- **A lesson in 課表 opens a sheet** (owner, 2026-11-04, 問題 3 選項 A:
  parents tapped the card and nothing happened; 改期/取消 were small and side
  by side). In the app the whole card (`.msa-lesson-tap`, with a › button for
  keyboards) opens `lessonSheet`: the date, then the same card drawn by
  `renderLesson(b, true)` with its buttons full width, 取消 last and set
  apart, then 傳訊息給我們 / 關閉. The list hides the card's buttons, except
  on a move waiting for an answer (`.waiting`). Any button in the sheet's
  card closes the sheet, since it opens its own dialog. The website's cards
  are unchanged.
- **Text follows the phone's text size** (owner, 2026-11-04, 問題 2 選項 A:
  grandparents found it too small; no size switch inside the app). Android's
  web view already does it. On the iPhone TEXT_SIZE_FN (lib/native-app.ts,
  run by APP_DETECT_SCRIPT before paint and by AppBridge when the app comes
  back) reads -apple-system-body (17px = standard) and sets
  -webkit-text-size-adjust on <html>: never smaller than the design, at most
  140%. Keep font sizes in px as they are -- that property scales them all.
  Screens that fit one page may then scroll; the home cards shrink the
  swimmer instead. To see a page large in Chromium: isMobile context and
  `document.documentElement.style.webkitTextSizeAdjust = '140%'`.

- **No website pages in the app** (owner, 2026-11-03: the login page's name
  and logo went to the website's home page, where the customer was stuck).
  The sign-in pages are where the app starts: their MANTA SHARK and logo are
  plain text there (components/brand/HomeLink). The website's home page
  (/, /zh-Hant, /zh-Hans) goes to /dashboard -- APP_DETECT_SCRIPT on a full
  load, AppShell on a move inside the page -- and /dashboard sends a
  signed-out family to the login page. /plans in the app is the 儲值 screen
  (balance, buying, the price list; no hero, Swim Team or closing call).
  The info pages 我的 links to (programs, levels, FAQ, about, policies) are
  app screens too (owner chose 版本一: the five rows stay, each opens a short
  page): components/brand/AppInfoPage (`useAppLook`, the `.ai` frame: title
  on the pale blue, white cards). Programmes = four cards with points from
  BASE_POINTS and one button each (預約 → /booking; adaptive → 訊息 tab; team
  → /checkout?plan=team); levels = the phone accordion; FAQ = the same FAQ
  list as cards, "ask us" → /dashboard/chat; about = intro, four promises,
  coaches; policies = the five documents as rows. The legal documents
  (components/brand/LegalPage) switch in CSS only (`.lg-app`/`.lg-web` under
  html.msa-app) so they stay server pages. The website keeps every full page.
  **課程項目 and 儲值 fit one screen, nothing to scroll** (owner, 2026-11-03):
  programmes are tight cards (button beside the name, price, a one-line
  description; AppInfoPage `fit`); 儲值 puts each class's price inside its
  own button (the separate price list is gone in the app) with the balance
  beside the title. Both stop the page bouncing (overscroll-behavior), get
  tighter still under 720px of height (iPhone SE), and only scroll if even
  that does not fit -- e.g. with the Zelle box opened.
- **Back returns to the same place on the page** (owner, 2026-11-03:
  我的 → 課程項目 → ‹ went to the top). AppShell notes window.scrollY in
  sessionStorage (msa_scroll:<path>) whenever a link is tapped, and on
  popstate scrolls back there once the page is tall enough (我的 fills in
  from the server). It starts from the popstate itself: the router can draw
  the earlier page before a render effect would see the event.
- **html.msa-app** is set before the first paint by a script in the root
  layout's <head> (lib/native-app.ts APP_DETECT_SCRIPT): the app's user agent
  carries `MantaSharkApp` (mobile/capacitor.config.json appendUserAgent), and
  older builds are known by Capacitor's bridge. Everything the app hides is a
  rule under `html.msa-app` in app/globals.css; mark website-only bits
  `.msa-web-only`.
- **The dashboard is two tabs.** /dashboard/schedule re-exports the dashboard
  page; `view` (from the path) goes on the root as data-view. In the app,
  首頁 hides `.msa-sched` (the lesson list) and 課表 hides `.msa-home`. A
  sheet a 首頁 button opens must not live inside a `.msa-sched` section (the
  lesson detail was moved out for this).
- Something fixed to the bottom of a page sits on the tabs in the app: give
  it a class and a `bottom: var(--app-tab-h)` rule there, as `.msa-book-bar`.
- **我的 is a member card** (owner, 2026-11-03, 樣貌一 of five, after five
  tab / left-rail layouts were turned down; app/(public)/dashboard/me):
  one screen, nothing to scroll. A navy card -- MANTA SHARK 會員, name,
  purchased points with the gift badge, the email, 看明細 (tap: the
  statement) -- with a QR in its corner that opens a swimmer's check-in QR
  on 首頁 (/dashboard?qr=<swimmer id>; with several swimmers a sheet asks
  whose first). Four round shortcuts: 儲值, 點數明細, 介紹朋友, 共同預約.
  我的方案 is a row of small cards sliding sideways (fixed class with a
  progress bar from total/left, make-up vouchers, swim team), or one
  "no plans yet / book" card. Four small buttons: 帳號與孩子, 通知設定
  (/dashboard/me/notifications, app only -- the push switches moved there),
  關於學校 (/dashboard/me/school, the six school pages), 寫給我們; then 登出.
  A view-only member sees no points and no shortcuts. Under 720px of
  height everything tightens and the plan cards drop the child's name.
  **Its sheets open over 我的 itself** (owner, 2026-11-04: from /dashboard
  the tab turned to 首頁 under them): the card and 點數明細 open the points
  card alone with the statement already open (PointsCard historyFirst), 介紹
  朋友 the referral card alone, 寫給我們 the suggestion box -- all three now
  live in app/(public)/dashboard/FamilySheets.tsx, shared with the dashboard,
  whose ?points= sheet (from emails) still shows points, referral and team
  together. The suggestion box asks 確定要送出嗎？ before sending, and 登出
  (now small grey text) asks 要登出嗎？ first -- both too easy to tap by
  mistake. Still linked into the dashboard: ?team= and ?qr=. No language
  section on 我的: the top bar's language button is the one place to switch
  (owner, 2026-11-02).
- **Account pages in the app** (components/brand/AcctStyles.ts, owner,
  2026-11-04): tighter padding and heading under html.msa-app; 共同預約 fits
  one screen (the empty state is one row); on 帳號資料與孩子 each swimmer is
  one line -- name and birthday, the health answer as a chip (red not
  answered, green none, amber with the notes).
- The tabs shrink while the page is scrolled down and come back on the way
  up (owner, "like Instagram"): html.msa-tabs-small, --app-tab-now.
- **The look of the two bars** (owner, 2026-10-28). Top: the website's phone
  bar, a floating white card with MANTA SHARK and its chevron, never moving;
  no book button or menu, a language button on the right, and a back arrow
  before the name on any page that is not a tab. The language button asks
  the hidden website bar to switch (APP_SET_LOCALE_EVENT; components/Navbar
  keeps the saving rules in one place). Bottom: a floating white capsule,
  icons with their names, the current one on a pale blue pill; scrolled
  down, the names fold away and it narrows. --app-bar-h / --app-tab-h are
  the room each takes, not their height.
- iOS: the status bar band stays white (SafeAreaContainer in
  mobile/ios/App/App/SceneDelegate.swift starts the web view below it), and
  the page runs to the very bottom, under the home indicator, with no inset
  from iOS (contentInsetAdjustmentBehavior .never). Inside the app the
  viewport is viewport-fit=cover (APP_DETECT_SCRIPT, coverViewport()), so
  env(safe-area-inset-bottom) is the home-indicator band; the app also
  sets --msa-sab itself (SafeAreaContainer), and --app-sab is the larger of
  the two. The tabs sit --app-tab-gap over the screen's edge: 22px with a
  home indicator, where Instagram puts its own (owner, 2026-10-28, after
  trying 10px, 50px and 40px), 8px without. The room kept for them
  (--app-tab-h) follows it; the chat's input row adds --app-sab.
  Anything new fixed to the bottom of an app page must add it too. The
  page colour behind the tabs is #e9eff7 (html.msa-app body). History
  (owner, 2026-10-28): white strips over iOS's own insets cut the tabs in
  half once scrolled; a web view inside the safe area left a white band
  under the tabs. The app is always in light mode (Info.plist
  UIUserInterfaceStyle), so the status bar text stays dark on that white.

# Lessons in the family's calendar: a subscription (owner, 2026-11-02)

The owner wanted every lesson in the calendar at once, kept up to date, never
twice, and a cancelled lesson gone. That is a subscribed calendar, not files:
lib/calendar-feed.ts, table calendar_feeds (docs/migration-calendar-feed.sql,
server only). One long random token per family; the feed
/api/calendar/feed/<token>.ics (no login -- the token is the key) holds the
family's live lessons from 60 days back, in its language, named "Manta Shark
課程". Google or the iPhone reads it again by itself: Google every few hours
at best, the iPhone as its settings say.

- The card at the top of the schedule (components/AddToCalendar.tsx, when
  there are lessons): **Google 日曆** (Google's "add this calendar" page,
  ?cid=webcal://...), **iPhone 行事曆** (the webcal:// link; Apple／Outlook on
  a computer), 複製連結. Inside the iOS app the webcal link must go through
  the CalendarAdd plugin (mobile/ios/App/App/CalendarAdd.swift): the link is
  on the site's own address, so the web view keeps it, cannot open it and
  shows offline.html, the "no internet" page (found 2026-11-02). 複製連結
  (其他行事曆：複製訂閱連結, for Outlook and the like) is on computers only
  (owner, 2026-11-03: on a phone it only puzzles). Android
  and iPhone builds made before the plugin offer Google only.
- **Google: sign in with Google** (owner, 2026-11-02/03; lib/google-calendar.ts,
  table google_calendar_links, docs/migration-google-calendar.sql). Google
  Calendar's phone app cannot subscribe to a link (the ?cid= page sent the
  owner to a Google sales page); mailing the link to open on a computer was
  built and dropped as too fiddly, and so was one parent mailing it to the
  others. Now 日曆 Google signs in with whichever Google account the person
  uses (not the registered email), scope calendar.app.created only (Google
  lists it as non-sensitive: we can make our own calendar and manage it,
  nothing else), and the server keeps a "Manta Shark 課程" calendar in that
  account equal to the family's lessons -- event ids from the lesson UIDs, so
  nothing doubles; moved lessons update, cancelled ones go. Synced on
  connect, after every lesson email (lib/email.ts, via after()) and when the
  schedule is opened and the last sync is over an hour old. Google Cloud
  project "Manta Shark Calendar" (company account; NOT "Manta Shark Website",
  which is Zelle's Gmail project), OAuth client "Manta Shark Website", env
  GOOGLE_CALENDAR_CLIENT_ID / _SECRET. Without the env the card behaves as
  before: Google on a computer only (the ?cid= link), a phone iPhone 行事曆
  only, and nothing on a phone with no usable button. Inside the app the
  sign-in opens in Safari (Google refuses app web views); the signed state
  says who asked, so the callback needs no session. 停止同步 deletes our
  calendar and revokes the token. The page Google returns to (Safari, in
  the app) has 回到 App: mantashark://open, the app's own link scheme
  (Info.plist CFBundleURLTypes, the Android intent filter; 2026-11-03),
  with a hint for builds older than that. Tested end to end on the preview
  2026-11-03 (connect, lessons on the phone, 停止同步 removed them). The
  privacy policy's section 4 describes it -- Google reads that page before
  the app is published; change both together.
- **Each button says when it is synced** (owner, 2026-11-03;
  docs/migration-calendar-marks.sql). Google: a green ✓ badge when this
  login has connected a Google account -- exact, we did it -- and one row
  per account (its email, from the "openid email" scopes; 停止同步 each),
  with 再連一個 Google 帳號: one login may connect up to 3 Google accounts
  (MAX_GOOGLE_PER_PERSON; two phones on one login, each with its own
  Google; same account again = same row and calendar). iPhone: every phone
  or computer has its own subscribe link (calendar_feed_devices, the
  browser's id in localStorage msa_cal_device, ?device= on
  /api/parent/calendar-feed), and the ✓ shows when that link was read in
  the last DEVICE_FRESH_DAYS (3): iOS never says it deleted a calendar, so
  the mark goes when the reading stops. The family's old shared link
  (calendar_feeds) still serves calendars already on it, but marks no
  phone. The folded line's ✓ is either of the two, for this person.
- **To stop**, the family deletes the "Manta Shark 課程" calendar in its
  calendar app (iPhone: Calendars › ⓘ › Delete Calendar; Google on a
  computer: the calendar's settings › Unsubscribe); every lesson in it goes
  at once and nothing on our side changes. On a computer the button is the ?cid= link itself.
- **The card shows in full once** (owner, 2026-11-02: "it takes too much
  room"): the first time this browser opens the schedule (localStorage
  msa_cal_card_seen), with a ✕. After that it is one line, 把課表加進行事曆 ›
  (version C of three), that opens the card again.
- Once a calendar has read the feed (fetched_at within FRESH_DAYS, 14) the
  line reads ✓ 課表已同步到行事曆, and the family's lesson emails carry no .ics file
  (sendEmailWithId drops payload.calendar): the same lesson would show
  twice. Feed events have their own UIDs (feed-...) for the same reason.
- No per-lesson "add to calendar" button (owner, 2026-11-02: it was built,
  then replaced by this the same day). /api/parent/calendar (one lesson's
  .ics) stays but nothing links to it.

# The app's 訊息 screen (owner, 2026-10-28)

/dashboard/chat, the app's 訊息 tab: two tabs under a navy header, 通知
then 客服, opening on 客服 (owner, 2026-10-28, who swapped them and dropped
a third, 學校公告, folding it into 通知). The
look is the school's own and kept quiet (owner, 2026-10-28, after a
game-styled first version was "too much like a game"): a segmented control
for the tabs, white bubbles, the family's own in navy, small round avatars,
cards and event strips white with an amber left edge, a round amber send
button. docs/migration-app-inbox.sql.

- **客服** is the family's chat itself -- ChatWidget with variant 'page'.
  Inside the app the floating widget never opens: openChat() and ?chat=1 go
  to this page, which takes the waiting request. GlobalChat mounts nothing on
  this path, and AppShell steps aside (the page has its own header).
- **通知**, top down: active pool closures, what the desk posts on Admin >
  公告 (lib/announcements.ts, pinned first, shown as typed), then push_log.
  "Also push" sends category 'news' (opens ?tab=notices; the old ?tab=news
  still works), which goes only to people who turned on 學校公告與活動 --
  the one switch that is OFF unless turned on (Apple 4.5.4). The page asks
  once, the first time 通知 is opened in the app. push_log is written by
  pushFamily for every person with the app (whether or not that kind of
  push is switched off), in their phone's language, kept 90 days (cleanup
  cron); announcements are not logged there (they are listed above it).
  logFamily writes without pushing: stage-ups (review-progress) and
  level-ups (setStudentLevel, not an assessment's first level). A new kind
  needs an icon in both lists. One red dot covers all three.
- **Red dots** (owner, 2026-10-28): on 通知 when anything there is newer
  than the last look, on 客服 when a desk or AI reply is unread (from
  chat_threads.parent_last_read_at), each at the word's top right corner.
  The 訊息 tab in the bottom bar shows the unread replies as a number,
  else a dot for 通知 -- from GET /api/app/inbox?summary=1, asked on every
  page, when the app comes back to the front and every minute
  (components/AppShell).
- **Event strips**: the same push_log rows of the kinds in CHAT_EVENT_KINDS
  (reports, stage/level ups, closures, booking changes) laid across the chat
  by time.
- **Photos** (app/api/chat/photo): picked first, shown as a row of previews
  (each can be taken off, more added), and sent only on 送出 -- up to 5 at
  once, each its own message; one AI answer and one desk alert per batch.
  Private bucket chat-photos, the path in chat_messages.metadata.photo,
  served to the thread's family and to staff as a 5-minute signed link. The
  AI never sees one: ai-reply turns it into a line saying a photo was sent;
  with the AI on the thread it answers once that the desk will look, and the
  desk is alerted (throttled). In the chat each photo is a fixed 180px
  square (tap for the whole picture), so the list never grows as pictures
  load and the chat opens already at its newest message -- placed before
  paint, not scrolled to (owner, 2026-10-28).
- **Pictures only, from the photo library** (owner, 2026-10-28: no camera,
  no files). An iPhone web page's file button always offers Take Photo and
  Choose File too, so the iOS app picks photos itself: PhotoPickerPlugin
  (mobile/ios/App/App/PhotoPicker.swift, registered in
  AppViewController.capacitorDidLoad), reached through photoPickerPlugin()
  (lib/native-app.ts). The owner wants it at HALF the screen WITH the album
  choice and a search on top, like Facebook; Apple's picker hides its top
  bar at half height, so the app has its own sheet (PhotoSheet.swift:
  Recents and albums, a search over album names -- iOS lets no app search
  photo contents -- numbered picks; no Cancel or Done, owner: swiping it away hands over what is picked, to the preview row). The sheet draws itself over the chat (overFullScreen): iOS's page sheet moved with every tap on a photo, so its top bar drags it, and the photos pull it down only when already at their top (only a fast flick closes it; a slow pull, however far, springs back, as on Instagram). It opens at 60% of the screen (owner, after 50% and 55%). It needs the photo permission
  (NSPhotoLibraryUsageDescription), asked once; a family that says no gets
  Apple's picker (PHPicker, no permission). Its words come from the page
  (chat.photo.sheet.*). Photos are shrunk to 1600px JPEG on the phone.
  Android's file button already opens a picture-only picker, and iPhone
  builds older than the plugin fall back to it too.
- **Families never see which staff member replied** (owner, 2026-10-28):
  the app shows 櫃台 only. Who wrote it is chat_messages.sender_admin_id,
  shown on Admin > Messages through /api/admin/staff-names (the browser can
  read only its own admins row). Do not put a staff name in a message's
  metadata or body: families read their rows through RLS.
- Buttons in AI replies were already there (metadata.options, <<OPTIONS>> in
  lib/ai/system-prompt.ts); the page only draws them in the new style.

# The 3D swimmer on the app's home cards (owner, 2026-10-29)

Inside the app, 首頁's swimmer cards are a curved deck (components/swimmer/
SwimmerDeck.tsx): each card has a 3D cartoon swimmer standing in a little
square pool (lane ropes, a ladder) on top, and the card's usual content below
it. Several swimmers swipe left and right on a curve; the middle one turns
with a finger and is dressed with 換造型 (boy/girl, hair, swimsuit, goggles,
cap, fins, colours). The website, and 課表, keep the plain cards (Rail). The
owner chose this look from three (版本一 豆豆身: a rounded trunk and a barely
visible neck) and asked for no wave/cheer actions -- only a slow breathing.

- **One card per swimmer, on purpose** (owner, 2026-10-29). He tried every
  swimmer on one turning pool with a single card below, saw it live and
  went back to this -- keeping the pool as the base. Do not bring the
  turntable back without asking.
- **The swimmer's turning speed is the owner's** (2026-10-29, after "not
  fast" and then "a little faster"): the constants at the top of engine.ts.
- **The cards are a native scroller, on purpose** (owner, 2026-10-29:
  "completely smooth, no stutter"). Two versions that moved the cards with
  JavaScript on every finger move (one through React, one writing styles
  directly, with a spring) both stuttered on the iPhone -- anything on the
  main thread (3D drawing, React, the phone) delays the next move. Now the
  deck is `overflow-x: auto` with scroll-snap (center, snap-stop always),
  so iOS moves it itself. **No scroll-driven effects on the cards** (owner,
  2026-10-30): a curve and side-card dimming done with CSS scroll-driven
  animations were worked out on the page's main thread on the iPhone, and
  the whole card jerked as it arrived; the cards are now a flat row. The
  scroll handler only sets a timer (and the dots when the nearest card
  changes); the grab-box outline is measured while the phone is idle, never
  on arrival. Each pool's water has its own clock that runs only while that
  card is drawn, so the ripples never jump when a card starts again. Do not put touch or pointer listeners on the deck that could
  stop the scroll (non-passive ones make iOS wait for the main thread).
- **Only a finger that lands ON the swimmer turns it** (owner, 2026-10-29);
  the pool, the sky and the card below all scroll. The live card carries
  invisible `.sw-hold` boxes over the swimmer (engine.swimmerBoxes(): head,
  body and legs, measured once per look from the posed body) with
  `touch-action: none`, so the phone itself decides scroll-or-turn.
- **Arriving on a card changes nothing on screen** (owner, 2026-10-30:
  "still a pause -- can't this be solved?"). Every card has its own live
  3D view (its own WebGL canvas, never moved; a family has at most three
  swimmers) and always carries its own 換造型 button and hint. Only the
  middle swimmer breathes and turns; the others keep their last frame. So
  arriving swaps nothing -- no picture-to-live switch, no canvas moved, no
  React render: activate() only tells the engine which swimmer is active,
  places the grab boxes and marks the dots, after the cards stop and the
  finger has lifted. Earlier versions moved one canvas between cards over
  still pictures, and the swap itself was the pause. Keep the middle card
  out of React state.
- **The app's home is one screen that does not scroll up and down**
  (owner, 2026-10-31, version C of three mockups: "only the cards move
  sideways"). No 學生資料 heading (it stays as the section's aria-label).
  The greeting is one line; `.msa-root[data-view="home"]` is exactly the
  screen between the top bar and the tabs (globals' `--app-tab-h`), and
  `.msa-main` is a column whose middle (`.sw-fit`) the cards fill.
  SwimmerDeck sizes the swimmer's picture (`--sw-stage-h`, 150-440px) to
  what is left once the tallest card's own lines are counted -- on load and
  on resize only (ResizeObserver), never during a swipe; `.sw-fit`'s
  flex-basis is those lines plus the smallest picture, so measuring cannot
  feed back, and on a phone too short even for that the middle scrolls
  instead of cutting anything.
- **Each tab does one job, and every button sits where its reason is**
  (owner, 2026-11-01, version 2 of five whole-app layouts). 首頁 = the
  children: the card has name and level over the picture (`renderOverlay`
  → deckOverlay), 換造型 top left, the spin hint top right, and one row of
  tiles (學習地圖, 上課紀錄, the monthly report, the assessment report; a new
  swimmer gets "book the assessment") -- no progress bar, stage name or
  percentage (the learning map says that). Under the cards one line, the
  family's next lesson (`.msa-nextline`): plain on other days, amber with
  **報到** on the day of the lesson -- check-in belongs to a lesson, not to a
  child, so the card has no 報到 any more (the button shows the swimmer's QR,
  or the one-tap "I'm here" once a pool is set up). No booking button on
  首頁 (預約 is a tab). 課表: a lesson whose check-in is open shows a 報到
  button instead of the "check-in open" label. 我的 holds all the money:
  points (tap: statement; 儲值) and 我的方案, each plan a row that goes where
  it is used (fixed class → its page, vouchers → /booking?voucher=, swim
  team → /dashboard?team=). 預約: a 幫誰 / 課程 / 時間 step bar and each child's
  own swimmer face (components/swimmer/SwimmerFace.tsx, from the same look).
  Notices that used to be boxes are one line on 首頁 (safety info; partner
  invitations, which live on 課表 -- the line opens
  /dashboard/schedule#invites). The website keeps studentCard, the booking
  bar and the folded plans line. Do not add anything to 首頁 that makes it
  taller; shrink the picture or make it a line.
- The camera: FOV 30 looking at y 1.0, widening on a tall picture only far
  enough to keep 86% of the pool's width (engine.ts size()), so the swimmer
  stands between the top buttons and the name.
- The pool's blue edge once flickered: faces that share a plane fight
  (z-fighting). Keep new parts off each other's surfaces and the camera's
  near plane at 2.
- **The model is made by code.** public/3d/swimmer-v1.glb comes from
  scripts/swimmer/swimmer.py (Blender) and pack.mjs; scripts/swimmer/README.md
  says how to rebuild it and which part and material names the page relies
  on. Do not hand-edit the GLB; rebuild it over the same name.
- **three.js loads only there.** SwimmerDeck is a dynamic import, mounted only
  when `appLook()` and view === 'home'; engine.ts is its only importer of
  three. One WebGL canvas per card (pixel ratio 2 at most); only the middle
  one is redrawn. Nothing is drawn while the cards slide, are off screen or
  the app is in the background; breathing is drawn at 30 frames a second. No WebGL, or a
  model that will not load: the plain cards show (the `fallback` prop), as
  on the website.
- **The look is students.avatar_look** (docs/migration-swimmer-look.sql),
  written only by POST /api/parent/swimmer-look, which anyone in the family may
  call -- view-only members too (owner: it costs nothing). Every value is from
  the lists in lib/swimmer-look.ts; cleanLook() refuses the rest.
- **No look yet:** the card starts from students.gender (boy: short hair and
  jammers; girl: ponytail and a one-piece; colours from the swimmer's id). A
  swimmer with no gender wears a swim cap (NEUTRAL in SwimmerDeck.tsx) and is
  **not asked anything** -- "Change look" carries a red dot until the family
  picks a look; closing the sheet unchanged leaves it unpicked (owner,
  2026-11-04, 選項 C「不問，先戴泳帽」: the old "a boy's or a girl's look?"
  box is gone; the API still takes { style } for old app builds). A picked
  look is saved as avatar_look only. **The look never
  writes students.gender** (owner, 2026-10-29: a look is not a statement
  about the child).
- **Families are not asked a gender** (owner, 2026-10-29: first required,
  then optional, then "don't ask, it's simpler"). The register form and My
  Account do not ask; components/GenderQuestion.tsx is unused, kept only
  until someone can delete it. students.gender is filled only by the desk
  (optional on Admin > Members); 'male' / 'female' are the values
  lib/monthly-reports.ts reads. The servers still accept a gender from an
  older page and store only 'male' / 'female'.

# Booking asks "how" before "when" (owner, 2026-11-01, BK15)

- After the course, 1-on-1, a sibling 1-on-2 and the group class ask **要怎麼上？**
  (`way` in app/(public)/booking/page.tsx; the step bar becomes 幫誰 / 課程 /
  怎麼上 / 時間). Not an assessment, a move, a make-up or a 1-on-2 with another
  family: those are one lesson each. Two cards: **每週固定上課** (推薦; with the
  latest assessment's course and frequency when it is for this course) and
  **單次上課**. The 14-day rule for singles is said here, before any calendar.
- Above them, only when the school can be sure, one dark card that finishes
  the job: **續報** when the swimmer's fixed class of this course is open for
  renewal (goes to /dashboard/fixed-class/{id}?renew=1), otherwise **跟上次一樣**
  -- weekday, time and coach of the swimmer's last lesson of this course
  (GET /api/parent/last-lesson; taught lessons only, never the assessment),
  offered as a weekly class. Hidden when that time is not open with that
  coach in the next two weeks, or when the swimmer already has a running
  fixed class of the course. The chooser waits for its data, so nothing pops
  in under a finger.
- **Every week**: weekday chips, then that weekday's times (each with the
  first date it is open), then the existing fixed-class panel (dates, total,
  就選這 N 堂). The month calendar is not shown on this path. 30/60 minutes
  for 1-on-1 and sibling 1-on-2. Morning times in the left column, afternoon
  in the right (owner, 2026-11-02: he tried stacked 上午 / 下午 sections and
  went back to the columns, though the afternoon one runs longer). A cell
  is the time alone (the coach is chosen above; a group class still names
  its coach), no AM/PM (the column says 上午 / 下午), two-digit hours --
  02:00 not 2:00 -- so they line up (owner, 2026-11-02).
  The start date is said once under the heading (the date most times start
  on); only a time that starts on another date shows its own (owner,
  2026-11-02: on every cell it repeated).
- **Every week is one fixed class at a time** (owner, 2026-11-02: two at
  once "seems to break"): one weekday, one time. Accepting a new one
  replaces the basket; the wallet arithmetic and the pre-ticks ignore what
  was chosen before; the 已選的課程 box says a new choice replaces it.
  The class in that box can be tapped (更改日期, `editFixed`): its panel
  opens again with its dates ticked. While a panel is open on this path
  there is no bottom bar (its 繼續 used to book the class chosen before),
  and the panel says which class it would replace (owner, 2026-11-02).
- **A week the class's coach cannot take may go to another coach** (owner,
  2026-11-02, version A of three -- before, a fixed class was one coach
  throughout and those weeks were silently left out). The preview gives
  each such date `alts` (lib/fixed-classes `weeklyAlternatives`: other
  coaches free at that time, one window read); the panel draws those weeks
  closed (訂走 / 休息 / 沒空) and lists, up to the last chosen week, one
  row per coach with the weeks they can take and 改上. A week moved is
  purple with the coach's name (SUB_COLOR) in the calendar, on the
  confirm page, on the success card and on the class's own page
  (/dashboard/fixed-class; tested on the preview 2026-11-02); the class line adds "(其中 N 堂其他教練)". Nothing is moved
  by itself. The server takes a fixed group whose weeks share weekday and
  time; its coach (fixed_classes.coach_id, and what a renewal must keep) is
  the one most of its weeks are with. The class starts on the first week
  its coach is free (weeks before that are not offered to others), and a
  week moved adds a lesson -- the count and the points go up, nothing is
  dropped from the end (owner, 2026-11-02).
- **Keep the words short** (owner, 2026-11-02: "shorten whatever can be
  shortened, so the screen is not so long"): the panel's totals are one line,
  the hints are a few words, the coach hint is gone on these two paths, and
  the every-week basket box has no heading row (the bar says the count).
- **The dates of a fixed class are a calendar, one row a month** (owner,
  2026-11-02, version A of three): each cell is the date as 11/03 -- two
  digits each, so they line up like 02:00, and no month column beside the
  rows (owner, 2026-11-02, after the day alone) -- five columns, no points in
  the cells (the total is below), every date read so far on screen with no
  inner scroll box; a tap skips that week. 再往後看 adds the next weeks and
  moves the page to the first of them -- the old "show 26 more weeks" added
  them inside a scroll box and nothing seemed to happen.
- **The 要怎麼上 and every-week steps fit one screen** in the app (owner,
  2026-11-02): no 上一步 on the chooser (更改 on the course line is the way
  back), no bottom bar on the every-week path until a lesson is chosen, and
  a tighter page heading in the app (.bk-head / .bk-h1 / .bk-body in
  globals.css).
- **One at a time**: the old calendar, but a date past the 14-day window is
  drawn closed and a tap opens a sheet saying when it opens, with
  改選每週固定上課. It no longer silently turns into a fixed class.
- **A coach is always chosen on these two paths -- no 不限教練** (owner,
  2026-11-02, reversing 2026-11-01): first the coach of the swimmer's Swim
  Assessment (`assessCoachId` from /api/parent/last-lesson), then of their
  last lesson, then whoever has the most open time at this pool -- the first
  with any time there. Once per swimmer, course and pool; the family can
  change it, and a coach restored after a top-up is kept. Elsewhere (an
  assessment, a move, a make-up, a 1-on-2 with another family) 不限教練
  stays and gives a time to the coach with the most open time that day
  (`spreadPick`), not the last coach; /api/bookings/openings still returns
  `preferred` but the page ignores it.

# Several children booked together (owner, 2026-11-03)

app/(public)/booking/FamilyBooking.tsx, POST /api/bookings/family. It
replaced SiblingBooking (two children, single lessons only, opened from a
dashed box at the bottom of the first step; the file stays, unused).

- **The first step ticks children.** With two or more children who have a
  level (and not a move or a make-up), each card has a tick circle and a tap
  ticks it (up to 4); the amber button reads 繼續 for one (the usual
  one-child flow) or N 位一起上 · 繼續 for two or more. A child waiting for
  the Swim Assessment is still one tap, alone.
- **Then:** 上什麼課 (1-on-1, each child their own coach / 1-on-4, all in
  one class) → 要怎麼上 (每週固定 推薦 / 單次 within 14 days) → when. 1-on-1
  has 同時上 · 各自的教練 (the point of it: no waiting) and 前後連著上 · 同一位
  教練 (35 minutes apart, ⇅ 換順序, 換一位教練).
- **Only times every child can have** (owner, version A of two): from each
  child's /api/bookings/openings (1-on-1, 60 days) or group-classes
  (9 weeks); same time = one coach per child, no coach twice
  (matchCoaches). Tapping a time lists each child with their coach and
  換教練 (a coach no one else has, or a swap the other child can take).
- **Every week:** each child's /api/bookings/recurring preview at their
  coach and time, side by side; a week is open only if it is open for all
  (and, for a group class, has a seat each). The first ten open weeks are
  ticked; a tap skips one; 再往後看 adds 26 weeks. No substitute coaches
  here (the one-child panel's 改上) -- a week someone cannot have is 沒空.
- **All or nothing.** The route books each child through the one-child
  code -- createBooking (quiet) for a lesson, the recurring route's own POST
  (quiet: no email, it answers with booking_ids, fixed_class_ids and the
  mail) for a fixed class -- and on any failure, or a weekly child coming
  back a week short, cancels everything booked so far, refunds it and
  deletes the fixed classes it made. Confirmation emails go once everyone
  is in.

# The 50-person review (owner, 2026-11-04)

Four testers played 50 families and visitors over the app and the website;
the contained problems were fixed the same day. What to keep doing:

- **View-only members never see a control the server would refuse**: the
  fixed-class page (no leave/renew/move, a note instead), 共同預約 (note
  only; also gone from the website's account menu), /plans (a note, no pay
  buttons or Zelle), and 我的's voucher card (shown, not linked).
- **A greyed button still says why**: the schedule's 改期 inside 24 hours (or
  a 1-on-2 waiting for the other family) opens a short explanation with
  傳訊息給我們. The schedule's pill-sized buttons stay as the owner set them
  (2026-10-03); their ::after keeps the tap area large.
- **Ask before what cannot be undone or costs points**: several children
  booked together now confirm (who, how many lessons, points, what is left);
  so do 寫給我們 and 登出. A plain cancel says 已取消 and the points returned.
- **Typed emails are checked** (lib/email-typo.ts): format and common domain
  misspellings, on sign-up (before a code is sent; a changed address resets
  the timer) and forgot-password (which also takes the address typed on the
  sign-in page, through sessionStorage -- never the URL). ZIP is 5 digits.
  Form fields on sign-up are 16px at every width.
- **The chat bubble is not drawn** over the sign-in forms, nor over /booking
  on a phone. A visitor who asks for a person sees the confirmation as a
  school note (system message) and the header says a person has it.
- **Legal pages stay English**, with one line in the reader's language
  saying so (legal.enOnly, LegalPage reads the locale cookie).
- **A swimmer waiting for the assessment has a full card** on the website's
  home (owner, 2026-11-04, 問題 4 選項 A): a line on what the assessment is,
  the next lesson or 還沒有預約, and the amber 預約游泳評估 at the bottom.
  Every card's last row of buttons is `.msa-mcard-end` (margin-top: auto), so
  the rows line up across a family's cards.
- **Two children ticked can book a 1-on-2** (owner, 2026-11-04, 問題 5 選項 A):
  FamilyBooking lists 1-on-2 between 1-on-1 and the group class when exactly
  two are ticked, each option with its BASE_POINTS per child. It is not
  booked inside FamilyBooking: `onPair` hands both children to the booking
  page's own 1-on-2 flow (course chosen, second swimmer chosen, on to 怎麼上).
- **Booking several children looks like booking one** (owner, 2026-11-04,
  問題 6 選項 A). The booking page's pieces live in
  app/(public)/booking/parts.tsx -- StepBar, DoneRow, SectionTitle,
  SelectCard, COURSE_COLORS/ICONS -- and FamilyBooking uses them: the same
  step bar (幫誰 · 課程 · 怎麼上 · 時間), answered lines with ✓, titles,
  course cards (icon, minutes and size, points chip) and 每週固定／單次
  cards; with no times, 改選單次上課 and 傳訊息給我們. Change a piece there
  and both flows change.
- **The booking's confirm step is one summary card** (owner, 2026-11-04,
  問題 7 選項 A): no answered lines above it; the swimmer, then course ·
  minutes · coach · pool, then when; a weekly plan's dates fold into one
  line (`.bk-dates`, open by itself when a week has another coach); the
  points once (the base line only when off-peak or a voucher took something
  off) and what is left; the rules as a quiet line; 上一步 / 確定 in the
  sticky `.msa-book-bar`, so it is on screen without scrolling.
- **app/(public)/error.tsx** is the translated, branded page for a page
  that fails to draw.
- **Numbers of points always carry separators** (booking page `nf()`).
- **globals.css: write short-screen rules as `@media screen and
  (max-height: …)`.** A bare `@media (max-height: 720px)` block was dropped
  from the compiled CSS without a word (2026-11-04); the same rule in a
  page's own <style> is not affected.
