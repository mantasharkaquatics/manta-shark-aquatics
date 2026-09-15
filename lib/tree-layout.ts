/*
 * Where a skill sits on the learning map, and how a line gets from one skill to
 * another.
 *
 * The rows are the stages: 階段 1 on the top row, 階段 2 under it, 階段 3 under
 * that, in every level. That is the curriculum's own shape, and it is the shape
 * the coach and the parent already have in their heads -- the previous version
 * put a skill one row below the deepest thing it needed, which drew a truthful
 * graph of a structure nobody thinks in.
 *
 * Fixing the rows is what makes the lines hard. A prerequisite no longer always
 * comes from the row above: it can come from the same row, or skip a row
 * entirely. Each of those gets its own way through, and none of them is allowed
 * to cross a skill name.
 *
 * No React in here, so the map and the harness that measures it run the same
 * code rather than two copies that drift apart.
 */

export type TreeInput = {
  id: string
  /** 1, 2 or 3 -- the row. */
  stage: number
  sort: number
  /** Prerequisite ids. Only the ones on this level matter here. */
  needs: string[]
}

export type Spot = {
  row: number
  /** Fractional: a short row is centred, so it sits at half-column offsets. */
  col: number
}

/** Board geometry, read from the CSS custom properties actually in use. */
export type Geom = {
  cw: number
  rh: number
  sz: number
  /** The side gutter a row-skipping line runs down, in px. */
  lane: number
  /** Empty strip above the first row, so row 1 has a channel like every other
      row -- a bracket over the top row needs somewhere to be. */
  pad: number
  cols: number
}

export type Edge = { from: string; to: string }

/**
 * Rows are the stages. Inside a row, a skill stands directly under the
 * prerequisite it comes from, so the line between them is straight down.
 *
 * Centring a short row was the older rule and it put every tile half a column
 * off its parent, which turned every line into a dog-leg for no reason. A skill
 * whose prerequisites are all on its own row (or on an earlier level) has
 * nothing to stand under, so it fills a gap the anchored ones left.
 */
export function placeLevel(nodes: TreeInput[]): {
  rows: number
  cols: number
  spots: Record<string, Spot>
} {
  const rows = Math.max(1, ...nodes.map(n => n.stage))
  const byRow: TreeInput[][] = []
  for (let r = 1; r <= rows; r++) {
    byRow[r] = nodes.filter(n => n.stage === r).sort((a, b) => a.sort - b.sort)
  }
  let cols = Math.max(1, ...byRow.slice(1).map(r => r.length))

  const spots: Record<string, Spot> = {}
  /* The first row has nothing to align to, so it is centred. */
  const first = byRow[1] || []
  first.forEach((n, i) => { spots[n.id] = { row: 1, col: (cols - first.length) / 2 + i } })

  for (let r = 2; r <= rows; r++) {
    const row = byRow[r]
    if (!row.length) continue

    /* Two prerequisites in different columns average to a half column, which
       would stand the child between two tiles instead of under one. Round to a
       whole column: under one of its parents beats between both of them. */
    const want = (n: TreeInput) => {
      const above = n.needs.map(q => spots[q]).filter(Boolean)
      if (!above.length) return null
      return Math.round(above.reduce((s, p) => s + p.col, 0) / above.length)
    }
    const anchored = row.map((n, i) => ({ n, i, w: want(n) }))
      .filter(x => x.w !== null) as { n: TreeInput; i: number; w: number }[]
    const floating = row.map((n, i) => ({ n, i, w: want(n) })).filter(x => x.w === null)

    if (!anchored.length) {
      const off = (cols - row.length) / 2
      row.forEach((n, i) => { spots[n.id] = { row: r, col: off + i } })
      continue
    }

    /* Anchored tiles keep their parent's column, in order, never closer than one
       column apart; if that pushes the last one off the right edge the whole run
       slides back left by however much it overflowed. */
    anchored.sort((a, b) => a.w - b.w || a.i - b.i)
    const at: number[] = []
    anchored.forEach((x, k) => { at.push(k ? Math.max(x.w, at[k - 1] + 1) : x.w) })
    const over = at[at.length - 1] - (cols - 1)
    if (over > 0) { const back = Math.min(over, at[0]); for (let k = 0; k < at.length; k++) at[k] -= back }
    anchored.forEach((x, k) => { spots[x.n.id] = { row: r, col: at[k] } })

    /* Everything else takes the nearest free column to where its sort order puts
       it, so the row still reads left to right. */
    const taken = () => row.map(n => spots[n.id]).filter(Boolean).map(sp => sp!.col)
    for (const x of floating) {
      const free = (c: number) => taken().every(t => Math.abs(t - c) >= 0.999)
      let best: number | null = null
      for (let c = 0; c <= cols - 1; c += 0.5) {
        if (!free(c)) continue
        if (best === null || Math.abs(c - x.i) < Math.abs(best - x.i)) best = c
      }
      if (best === null) { best = Math.max(...taken(), -1) + 1; cols = Math.max(cols, best + 1) }
      spots[x.n.id] = { row: r, col: best }
    }
  }
  return { rows, cols, spots }
}

/**
 * One path per edge, keyed `from>to`.
 *
 * Three cases, three ways through:
 *   next row    -- straight down, turning in the channel above the target.
 *   same row    -- a bracket over the top of the row.
 *   skips a row -- out to a gutter at the side of the board, down past the row
 *                  in between, back in. Straight down would cross the middle
 *                  row's tiles or its names; the gutter is the only space on
 *                  the board that is guaranteed empty.
 */
export function routeWires(
  edges: Edge[], spots: Record<string, Spot>, g: Geom,
): Record<string, string> {
  const x = (c: number) => g.lane + c * g.cw + g.cw / 2
  const top = (r: number) => g.pad + (r - 1) * g.rh
  const bottom = (r: number) => top(r) + g.sz
  const width = g.lane * 2 + g.cols * g.cw
  /* The channel between one row's names and the next row's tiles is 30px.
     Three lanes in it, so one horizontal run never sits on another. */
  const lane = (r: number, k: 0 | 1 | 2) => top(r) - [8, 17, 26][k]

  /* Where a skill-free vertical gutter is, row by row: a centred row's tiles
     are contiguous, so the empty space is whatever lies left of its first name
     and right of its last one. The outer `lane` is empty on every row, which is
     what makes a fallback always available. */
  const span: Record<number, { lo: number; hi: number }> = {}
  for (const s of Object.values(spots)) {
    const r = span[s.row] || (span[s.row] = { lo: s.col, hi: s.col })
    r.lo = Math.min(r.lo, s.col); r.hi = Math.max(r.hi, s.col)
  }

  const out: Record<string, string> = {}
  const list = edges
    .map(e => ({ ...e, a: spots[e.from], b: spots[e.to] }))
    .filter(e => e.a && e.b && e.b.row >= e.a.row)
  /* Shortest hops first, so they take the gutter closest to the tiles and the
     long ones end up outside them: the lines nest instead of braiding. */
  list.sort((p, q) => Math.abs(p.a.col - p.b.col) - Math.abs(q.a.col - q.b.col))

  /* Skills that skip a row are grouped by the skill they come from: two
     dependants of the same prerequisite ride the same gutter and split at the
     bottom, instead of drawing two near-identical lines side by side. Lines
     from DIFFERENT prerequisites are never merged -- a shared line would say
     they share a cause, and they do not. */
  const group = new Map<string, { x1: number; mid: number; rows: number[] }>()
  for (const e of list) {
    if (e.b.row - e.a.row < 2) continue
    const g0 = group.get(e.from) || { x1: x(e.a.col), mid: 0, rows: [] }
    g0.mid += (x(e.a.col) + x(e.b.col)) / 2
    g0.rows.push(e.b.row)
    group.set(e.from, g0)
  }
  const gutter = new Map<string, { gx: number; yOut: number }>()

  let leftUsed = 0, rightUsed = 0
  for (const e of list) {
    const x1 = x(e.a.col), x2 = x(e.b.col)
    const key = e.from + '>' + e.to
    const drop = e.b.row - e.a.row

    if (drop === 1) {
      const y1 = bottom(e.a.row) + 2, y2 = top(e.b.row) - 4, ly = lane(e.b.row, 0)
      out[key] = Math.abs(x1 - x2) < 2
        ? `M${x1} ${y1} L${x2} ${y2}`
        : `M${x1} ${y1} L${x1} ${ly} L${x2} ${ly} L${x2} ${y2}`
    } else if (drop === 0) {
      const y = top(e.a.row) - 4, ly = lane(e.a.row, 1)
      out[key] = `M${x1} ${y} L${x1} ${ly} L${x2} ${ly} L${x2} ${y}`
    } else {
      let lane0 = gutter.get(e.from)
      if (!lane0) {
        /* Every row this group has to get past, and the space they all leave. */
        const g0 = group.get(e.from)!
        const deepest = Math.max(...g0.rows)
        let leftEdge = width, rightEdge = 0
        for (let r = e.a.row + 1; r < deepest; r++) {
          const sp = span[r]
          if (!sp) continue
          leftEdge = Math.min(leftEdge, g.lane + sp.lo * g.cw)
          rightEdge = Math.max(rightEdge, g.lane + (sp.hi + 1) * g.cw)
        }
        const mid = g0.mid / g0.rows.length
        const onLeft = Math.abs(mid - leftEdge) <= Math.abs(mid - rightEdge)
        /* One gutter per side, not one per group: everything that has to get
           past the middle row on the left goes down the same line. The price is
           that the trunk no longer says which prerequisite a branch came from --
           the branches leave it at different heights, and the coach's detail
           panel is where the exact list lives. */
        if (onLeft) leftUsed++; else rightUsed++
        lane0 = {
          gx: onLeft ? Math.max(6, leftEdge - 10) : Math.min(width - 6, rightEdge + 10),
          yOut: lane(e.a.row + 1, 2),
        }
        gutter.set(e.from, lane0)
      }
      const yIn = lane(e.b.row, 2)
      const y1 = bottom(e.a.row) + 2, y2 = top(e.b.row) - 4
      out[key] =
        `M${x1} ${y1} L${x1} ${lane0.yOut} L${lane0.gx} ${lane0.yOut} ` +
        `L${lane0.gx} ${yIn} L${x2} ${yIn} L${x2} ${y2}`
    }
  }
  return out
}
