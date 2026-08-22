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
