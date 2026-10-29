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
- 我的 links into the dashboard's sheets with ?points=1, ?points=refer and
  ?suggest=1. Notification switches live on 我的 (they only exist in the app).
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
SwimmerDeck.tsx): each card has a 3D cartoon swimmer on top and the card's
usual content below it. Several swimmers swipe left and right on a curve; the
middle one turns with a finger and is dressed with 換造型 (boy/girl, hair,
swimsuit, goggles, cap, fins, colours). The website, and 課表, keep the plain
cards (Rail). The owner chose this look from three (版本一 豆豆身: a rounded
trunk and a barely visible neck) and asked for no wave/cheer actions -- only
a slow breathing.

- **The model is made by code.** public/3d/swimmer-v1.glb comes from
  scripts/swimmer/swimmer.py (Blender) and pack.mjs; scripts/swimmer/README.md
  says how to rebuild it and which part and material names the page relies
  on. Do not hand-edit the GLB; rebuild it over the same name.
- **three.js loads only there.** SwimmerDeck is a dynamic import, mounted only
  when `appLook()` and view === 'home'; engine.ts is its only importer of
  three. One live WebGL canvas moves to the middle card; the others show still
  pictures. Nothing is drawn while the deck is off screen or the app is in
  the background; breathing is drawn at 30 frames a second. No WebGL, or a
  model that will not load: the cards show as before, without a swimmer.
- **The look is students.avatar_look** (docs/migration-swimmer-look.sql),
  written only by POST /api/parent/swimmer-look, which anyone in the family may
  call -- view-only members too (owner: it costs nothing). Every value is from
  the lists in lib/swimmer-look.ts; cleanLook() refuses the rest.
- **No look yet:** the card starts from students.gender (boy: short hair and
  jammers; girl: ponytail and a one-piece; colours from the swimmer's id). A
  swimmer with no gender wears a swim cap and the card asks "boy or girl?";
  the answer fills students.gender only while it is empty.
- **Gender is asked when a swimmer is added** (owner, 2026-10-29): the register
  form and My Account (components/GenderQuestion.tsx, 'male' / 'female', the
  values lib/monthly-reports.ts reads); optional on Admin > Members. The
  servers accept a missing answer (a page loaded before the question existed)
  and store none.
