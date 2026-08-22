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
  `/api/admin/assign-level`, `/api/admin/students/assign-level` and
  `/api/admin/review-level` all write `current_stage: 1` alongside the level —
  if you add another route that sets `current_level`, it must do the same.
- A stage is finished only when **every** skill in it reads 100. The database
  trigger `check_level_upgrade()` and `stageProgress()` in `lib/levels.ts` use
  the same rule on purpose, so the bar a parent sees and the promotion that
  follows it cannot disagree.
- **The trigger advances stages, never levels.** Finishing stage 3 leaves the
  swimmer there; moving up a level stays a coach recommendation an admin
  approves. Do not "fix" this by making the trigger promote.
- Parents cannot read `student_skill_progress` (RLS gives it to coaches only).
  The parent dashboard therefore derives current percentages by merging
  `progress_history` snapshots newest-first. Do not switch it to the live table
  without adding a policy.
- Skill ids never changed in the 9-to-7 migration, so every historical snapshot
  still resolves. Keep it that way: move a skill between levels, don't recreate it.
