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
 * Rows are the stages. Inside a row, a skill sits over the average column of
 * the prerequisites it has on this level, so a chain reads as a line down the
 * board instead of a zigzag across it.
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
  const cols = Math.max(1, ...byRow.slice(1).map(r => r.length))

  const spots: Record<string, Spot> = {}
  for (let r = 1; r <= rows; r++) {
    const row = byRow[r]
    const off = (cols - row.length) / 2
    const keyed = row.map((n, i) => {
      const above = n.needs.map(q => spots[q]).filter(Boolean)
      const bary = above.length ? above.reduce((s, p) => s + p.col, 0) / above.length : null
      return { n, i, key: bary ?? off + i }
    })
    keyed.sort((a, b) => a.key - b.key || a.i - b.i)
    keyed.forEach((k, i) => { spots[k.n.id] = { row: r, col: off + i } })
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
      /* Every row it has to get past, and the free space they all share. */
      let leftEdge = width, rightEdge = 0
      for (let r = e.a.row + 1; r < e.b.row; r++) {
        const sp = span[r]
        if (!sp) continue
        leftEdge = Math.min(leftEdge, g.lane + sp.lo * g.cw)
        rightEdge = Math.max(rightEdge, g.lane + (sp.hi + 1) * g.cw)
      }
      const onLeft = Math.abs((x1 + x2) / 2 - leftEdge) <= Math.abs((x1 + x2) / 2 - rightEdge)
      const slot = onLeft ? leftUsed++ : rightUsed++
      const gx = onLeft
        ? Math.max(6, leftEdge - 10 - slot * 7)
        : Math.min(width - 6, rightEdge + 10 + slot * 7)
      /* Two of these on the same side would otherwise share the same
         horizontal run as well as the same gutter and read as one line. */
      const yOut = lane(e.a.row + 1, 2) + slot * 3
      const yIn = lane(e.b.row, 2) + slot * 3
      const y1 = bottom(e.a.row) + 2, y2 = top(e.b.row) - 4
      out[key] =
        `M${x1} ${y1} L${x1} ${yOut} L${gx} ${yOut} ` +
        `L${gx} ${yIn} L${x2} ${yIn} L${x2} ${y2}`
    }
  }
  return out
}
